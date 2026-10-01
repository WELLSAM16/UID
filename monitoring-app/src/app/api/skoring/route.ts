import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/authServer';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { calculatePostScore, getDynamicKeywordCategories } from '@/lib/scoring';
import { readArchiveSheet } from '@/lib/igArchive';

async function getSnapshotSyncedAt(): Promise<string | null> {
    try {
        const snap = await getAdminDb().collection('ig_sync_state').doc('daily').get();
        if (snap.exists) return (snap.data()?.syncedAt as string) || null;
    } catch {
        // state opsional
    }
    return null;
}

export async function GET(request: Request) {
    try {
        const { response, user } = await requireUser(request);
        if (response) return response;

        const { searchParams } = new URL(request.url);
        const startDateParam = searchParams.get('startDate');
        const endDateParam = searchParams.get('endDate');
        const usernameParam = searchParams.get('username');

        // Sumber data: snapshot arsip harian (bukan live fetch) — filtering
        // tanggal lengkap sejauh histori yang sudah terkumpul di sheet arsip.
        const archived = await readArchiveSheet();
        let posts: any[] = [...archived];
        const accountsFetched = [...new Set(archived.map((p: any) => p.source_account).filter(Boolean))].sort();

        // Filter berdasarkan akun
        if (usernameParam && usernameParam !== 'Semua Akun') {
            posts = posts.filter((post: any) => post.source_account === usernameParam || post.username === usernameParam);
        }

        // Filter berdasarkan tanggal jika ada
        if (startDateParam || endDateParam) {
            const startDate = startDateParam ? new Date(startDateParam) : new Date(0);
            const endDate = endDateParam ? new Date(endDateParam) : new Date();
            // Set end date ke akhir hari
            endDate.setHours(23, 59, 59, 999);

            posts = posts.filter((post: any) => {
                if (!post.timestamp) return false;
                const postDate = new Date(post.timestamp);
                return postDate >= startDate && postDate <= endDate;
            });
        }

        // Fetch custom keywords
        const keywordMap = await getDynamicKeywordCategories();

        // Hitung skor untuk setiap post
        const scoredPosts = posts.map((post: any) => {
            // Ambil views (bisa dari plays jika video, atau views/impressions)
            const viewsCount = post.plays || post.views || post.impressions || 0;
            const likesCount = post.likes || 0;
            const scoreMetric = Math.max(likesCount, viewsCount);

            const scoringInfo = calculatePostScore({
                media_type: post.media_type,
                likes: scoreMetric,
                caption: post.caption || ''
            }, keywordMap);

            return {
                ...post,
                used_metric_value: scoreMetric,
                scoring: scoringInfo
            };
        });

        return NextResponse.json({
            posts: scoredPosts,
            accounts_fetched: accountsFetched,
            meta: { source: 'snapshot', syncedAt: await getSnapshotSyncedAt() },
        });
    } catch (error: any) {
        console.error("Error in skoring API:", error);
        return NextResponse.json(
            { error: "Failed to process scoring", details: error.message },
            { status: 500 }
        );
    }
}
