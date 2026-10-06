import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireUser } from '@/lib/authServer';

const COMPOSIO_BASE = "https://backend.composio.dev/api/v3.1/tools/execute";

async function callComposio(
    apiKey: string,
    entityId: string,
    connectedAccountId: string,
    tool: string,
    args: object
) {
    const res = await fetch(`${COMPOSIO_BASE}/${tool}`, {
        method: "POST",
        headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            entity_id: entityId,
            connected_account_id: connectedAccountId,
            arguments: args
        })
    });
    const json = await res.json();
    if (!res.ok || json.error) {
        throw new Error(typeof json.error === 'string' ? json.error : JSON.stringify(json.error));
    }
    return json.data;
}

interface MonitoredAccount {
    username: string;
    ig_user_id: string;
    entity_id: string;
    connected_account_id: string;
    status: string;
    /** Unit pemilik akun (UNIT_OPTIONS). Diisi belakangan saat data akun menyusul. */
    unitId?: string | null;
}

async function getMonitoredAccounts(): Promise<MonitoredAccount[]> {
    const adminDb = getAdminDb();
    const snapshot = await adminDb.collection("monitored_accounts").where("status", "==", "Active").get();
    return snapshot.docs.map(doc => doc.data() as MonitoredAccount);
}

async function fetchPostsForAccount(
    apiKey: string,
    account: MonitoredAccount,
    reqLimit: number,
    maxPosts: number
): Promise<any[]> {
    const { entity_id, connected_account_id, username } = account;
    let allMedia: any[] = [];
    let cursor: string | undefined = undefined;
    let pagesFetched = 0;

    // Step 1: Ambil daftar media dengan pagination
    while (allMedia.length < maxPosts) {
        const args: any = {
            ig_user_id: "me",
            fields: "id,caption,media_type,permalink,timestamp,username,like_count,comments_count",
            limit: reqLimit
        };
        if (cursor) {
            args.after = cursor;
        }

        const mediaData = await callComposio(apiKey, entity_id, connected_account_id, "INSTAGRAM_GET_USER_MEDIA", args);
        pagesFetched++;

        let batch: any[] = [];
        if (Array.isArray(mediaData)) batch = mediaData;
        else if (Array.isArray(mediaData?.data)) batch = mediaData.data;

        if (batch.length === 0) break;
        
        allMedia.push(...batch);

        // 3 bentuk paging: paging.cursors.after || paging.next || next
        let nextCursor = mediaData?.paging?.cursors?.after || mediaData?.paging?.next || mediaData?.next;
        if (!nextCursor) break;
        
        cursor = typeof nextCursor === 'string' ? nextCursor : undefined;
        // Parse cursor if it's a full URL
        if (cursor && cursor.startsWith('http')) {
            try {
                const url = new URL(cursor);
                cursor = url.searchParams.get('after') || cursor;
            } catch (e) {}
        }
    }

    allMedia = allMedia.slice(0, maxPosts);
    console.log(`Fetched ${pagesFetched} media pages, ${allMedia.length} total posts for ${username}`);

    // Step 2: Batch concurrency 5 untuk insights
    const results = [];
    const batchSize = 5;
    
    for (let i = 0; i < allMedia.length; i += batchSize) {
        const chunk = allMedia.slice(i, i + batchSize);
        const promises = chunk.map(async (post: any) => {
            try {
                let metricsToRequest = "views,reach,saved,shares,total_interactions";
                if (post.media_type === "VIDEO") {
                    metricsToRequest = "plays,views,reach,saved,shares,total_interactions";
                } else if (post.media_type === "CAROUSEL_ALBUM") {
                    metricsToRequest = "views,reach,saved,shares,total_interactions";
                }

                const insightsData = await callComposio(apiKey, entity_id, connected_account_id, "INSTAGRAM_GET_POST_INSIGHTS", {
                    ig_post_id: post.id,
                    metric: metricsToRequest
                });

                const metrics: Record<string, number> = {};
                const items: any[] = Array.isArray(insightsData?.data) ? insightsData.data : [];
                items.forEach((item: any) => {
                    const val = item?.values?.[0]?.value;
                    metrics[item.name] = (val !== undefined && val !== null && !isNaN(Number(val))) ? Number(val) : 0;
                });

                return {
                    id: post.id,
                    caption: post.caption || "",
                    media_type: post.media_type || "IMAGE",
                    permalink: post.permalink || "#",
                    timestamp: post.timestamp || "",
                    username: post.username || username,
                    source_account: username,
                    reach: metrics['reach'] ?? 0,
                    impressions: metrics['views'] ?? metrics['impressions'] ?? 0,
                    likes: post.like_count ?? metrics['likes'] ?? 0,
                    comments: post.comments_count ?? metrics['comments'] ?? 0,
                    shares: metrics['shares'] ?? 0,
                    saved: metrics['saved'] ?? 0,
                    plays: metrics['plays'] ?? 0,
                    views: metrics['views'] ?? metrics['plays'] ?? 0,
                };
            } catch (err: any) {
                console.error(`Error fetching insights for ${post.id}:`, err.message);
                // Fallback data dasar agar post tidak hilang
                return {
                    id: post.id,
                    caption: post.caption || "",
                    media_type: post.media_type || "IMAGE",
                    permalink: post.permalink || "#",
                    timestamp: post.timestamp || "",
                    username: post.username || username,
                    source_account: username,
                    reach: 0,
                    impressions: 0,
                    likes: post.like_count || 0,
                    comments: post.comments_count || 0,
                    shares: 0,
                    saved: 0,
                    plays: 0,
                    views: 0,
                };
            }
        });
        
        const chunkResults = await Promise.all(promises);
        results.push(...chunkResults);
    }

    return results;
}

export async function getInstagramData(limit: number = 50, maxPosts: number = 100) {
    const apiKey = process.env.COMPOSIO_API_KEY;
    if (!apiKey) {
        throw new Error("Missing COMPOSIO_API_KEY in environment variables");
    }

    let accounts: MonitoredAccount[] = [];
    try {
        accounts = await getMonitoredAccounts();
    } catch (firestoreError: any) {
        console.warn("Firestore read failed, falling back to env vars:", firestoreError.message);
    }

    if (accounts.length === 0) {
        const fallbackEntityId = process.env.COMPOSIO_ENTITY_ID;
        if (!fallbackEntityId) {
            throw new Error("No monitored accounts in Firestore and no COMPOSIO_ENTITY_ID fallback set.");
        }
        console.warn("No accounts in Firestore — using COMPOSIO_ENTITY_ID fallback");
        accounts = [{
            username: "default",
            ig_user_id: "me",
            entity_id: fallbackEntityId,
            connected_account_id: "",
            status: "Active"
        }];
    }

    const settled = await Promise.allSettled(
        accounts.map(account => fetchPostsForAccount(apiKey, account, limit, maxPosts))
    );

    const allPosts: any[] = [];
    const accountsFetched: string[] = [];
    const errors: { username: string; error: string }[] = [];
    const counts: Record<string, number> = {};

    settled.forEach((result, idx) => {
        const accountName = accounts[idx].username;
        if (result.status === "fulfilled") {
            allPosts.push(...result.value);
            accountsFetched.push(accountName);
            counts[accountName] = result.value.length;
        } else {
            console.error(`Failed to fetch for account "${accountName}":`, result.reason);
            errors.push({ username: accountName, error: String(result.reason?.message || result.reason) });
            counts[accountName] = 0;
        }
    });

    return {
        counts,
        posts: allPosts,
        accounts_fetched: accountsFetched,
        errors: errors
    };
}

function parseClamped(value: string | null, fallback: number, min: number, max: number): number {
    const n = parseInt(value || '', 10);
    if (isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

export async function GET(request: NextRequest) {
    try {
        const { response, user } = await requireUser(request);
        if (response) return response;

        let limit = 50;
        let maxPosts = 100;
        
        if (request) {
            const { searchParams } = new URL(request.url);
            limit = parseClamped(searchParams.get('limit'), 50, 1, 50);
            maxPosts = parseClamped(searchParams.get('maxPosts'), 100, 1, 100);
        }

        const data = await getInstagramData(limit, maxPosts);
        return NextResponse.json(data);
    } catch (error: any) {
        console.error("Error fetching Instagram data:", error);
        return NextResponse.json(
            { error: "Failed to fetch Instagram data", details: error.message, counts: {}, posts: [], accounts_fetched: [], errors: [] },
            { status: 500 }
        );
    }
}
