// script.js

// Global variables for Telegram User Data
let tgUser = {};
let currentUser = null; // Firebase user document

// Constants
const ADS_REWARD_POINTS = 0.3;
const TG_TASK_REWARD_POINTS = 1; // Corrected to 1 AS point as per detailed description
const REFERRER_REWARD_POINTS = 5;
const REFERRED_USER_BONUS_POINTS = 2;
const MAX_ADS_DAILY = 200;
const MAX_ADS_HOURLY = 25;
const BINANCE_WITHDRAW_POINTS = 1320; // $0.9
const GOOGLE_PLAY_WITHDRAW_POINTS = 710; // $0.5
// IMPORTANT: THIS CHANNEL ID IS USED FOR CONSOLE LOGGING AND BACKEND INTEGRATION.
// Client-side JavaScript CANNOT directly send messages to Telegram channels.
// This requires a backend (e.g., Firebase Cloud Function) using your bot's API token.
const WITHDRAW_CHANNEL_ID = '-1002991582791'; // This is the channel ID you provided.
const REQUIRED_TG_TASKS_FOR_REFERRAL = 4; // All 4 TG tasks
const REQUIRED_ADS_FOR_REFERRAL = 50; // 50 verified ads

// --- Helper Functions ---
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        console.warn('Toast container not found. Message:', message);
        return;
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function animateBalance(elementId, start, end, duration = 1000) {
    const element = document.getElementById(elementId);
    if (!element) return;

    let startTime;
    function easeOutQuart(t) {
        return 1 - Math.pow(1 - t, 4);
    }

    function animate(currentTime) {
        if (!startTime) startTime = currentTime;
        const progress = Math.min((currentTime - startTime) / duration, 1);
        const easedProgress = easeOutQuart(progress);
        const current = Math.floor(easedProgress * (end - start) + start);
        element.textContent = current.toLocaleString();

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            element.textContent = end.toLocaleString(); // Ensure final value is accurate
        }
    }
    requestAnimationFrame(animate);
}

function getTodayUTC() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function formatFirestoreTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    // Firestore Timestamps have a toDate() method
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
}

// --- Telegram Web App Initialization ---
Telegram.WebApp.ready();
Telegram.WebApp.expand();

// Capture Telegram init data
const initData = Telegram.WebApp.initData || '';
const initDataUnsafe = Telegram.WebApp.initDataUnsafe || {};
tgUser = initDataUnsafe.user || {};

// --- LOCAL_DEVELOPMENT_ONLY ---
// >>> IF YOU ARE TESTING DIRECTLY IN A BROWSER (NOT VIA TELEGRAM BOT), UNCOMMENT THIS BLOCK. <<<
// >>> REMEMBER TO COMMENT IT OUT BEFORE DEPLOYING TO GITHUB PAGES FOR PRODUCTION USE WITH THE BOT. <<<
/*
if (!tgUser.id) {
    console.warn("Telegram user data not available. Using dummy data for local development.");
    tgUser = {
        id: '123456789', // Use a consistent dummy ID for testing
        first_name: 'Dev',
        last_name: 'User',
        username: 'dev_user',
        language_code: 'en',
        is_premium: true
    };
}
*/
// --- END LOCAL_DEVELOPMENT_ONLY ---

// --- Firebase User Management ---
async function registerOrUpdateUser() {
    if (!tgUser.id) {
        console.error("No Telegram User ID available. Cannot perform Firebase operations. Please open from Telegram bot.");
        showToast('Please open the app via the Telegram bot for full functionality. (User ID Missing)', 'error');
        if (document.getElementById('profile-name')) document.getElementById('profile-name').textContent = 'Login Required';
        if (document.getElementById('as-points-balance')) document.getElementById('as-points-balance').textContent = '0';
        return;
    }

    const userRef = db.collection('users').doc(String(tgUser.id));
    try {
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            // New user registration
            currentUser = {
                user_id: String(tgUser.id),
                telegram_username: tgUser.username || `user_${tgUser.id}`,
                telegram_profile_name: `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim(),
                joined_at: firebase.firestore.FieldValue.serverTimestamp(),
                current_balance_as: 0,
                total_earned_as: 0,
                total_tasks_completed: 0,
                referrals_count: 0,
                streak_day: 0,
                last_checkin_at: null,
                last_seen_at: firebase.firestore.FieldValue.serverTimestamp(),
                flags: {},
                referral_code: `AS${tgUser.username || String(tgUser.id)}`, // Generate referral code
                referred_by: null,
                has_submitted_referral: false,
                initial_tasks_completed: false, // For referral eligibility
                ads_daily_count: 0,
                ads_hourly_count: 0,
                ads_last_hour_reset: firebase.firestore.FieldValue.serverTimestamp(), // Initial set
                tg_tasks_completed: [], // Array of task_ids
            };
            await userRef.set(currentUser);
            showToast('Welcome to AS Earn Hub!', 'success');
            console.log('New user registered:', currentUser.user_id);
        } else {
            // Existing user update
            currentUser = userDoc.data();
            // Update profile name/username in case they changed
            await userRef.update({
                telegram_username: tgUser.username || currentUser.telegram_username,
                telegram_profile_name: `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim(),
                last_seen_at: firebase.firestore.FieldValue.serverTimestamp(),
            });
            // Refresh current user data after update
            currentUser = (await userRef.get()).data();
            console.log('User data updated:', currentUser.user_id);
        }
        updateUI(); // Initial UI update after user data is ready
    } catch (error) {
        console.error("Error during user registration/update (Firebase Rules?):", error);
        showToast('Failed to load user data. Check Firebase rules or connection.', 'error');
        if (document.getElementById('profile-name')) document.getElementById('profile-name').textContent = 'Error Loading User';
        if (document.getElementById('as-points-balance')) document.getElementById('as-points-balance').textContent = '---';
    }
}

async function fetchUserData() {
    if (!tgUser.id) {
        console.error("No Telegram User ID available to fetch data.");
        return;
    }
    try {
        const userDoc = await db.collection('users').doc(String(tgUser.id)).get();
        if (userDoc.exists) {
            currentUser = userDoc.data();
            updateUI();
        } else {
            console.warn("User data not found for current Telegram ID. Attempting re-registration.");
            await registerOrUpdateUser(); // Re-attempt registration if not found
        }
    } catch (error) {
        console.error("Error fetching user data (Firebase Rules?):", error);
        showToast('Failed to retrieve your data. Please check your connection or Firebase rules.', 'error');
    }
}

async function updateUserBalance(points, taskType, reference = null, meta = {}) {
    if (!currentUser || !currentUser.user_id) {
        showToast('User not logged in. Cannot update balance.', 'error');
        return;
    }

    const userRef = db.collection('users').doc(currentUser.user_id);
    const newBalance = (currentUser.current_balance_as || 0) + points; // Ensure it's a number
    const totalEarned = (currentUser.total_earned_as || 0) + points;
    const totalTasks = (currentUser.total_tasks_completed || 0) + 1;

    try {
        await userRef.update({
            current_balance_as: newBalance,
            total_earned_as: totalEarned,
            total_tasks_completed: totalTasks,
        });
        currentUser.current_balance_as = newBalance;
        currentUser.total_earned_as = totalEarned;
        currentUser.total_tasks_completed = totalTasks;

        // Log the task
        await db.collection('tasks').add({
            user_id: currentUser.user_id,
            task_type: taskType,
            reference: reference,
            reward_points: points,
            status: 'COMPLETED',
            created_at: firebase.firestore.FieldValue.serverTimestamp(),
            meta: meta,
        });

        showToast(`+${points} AS Points!`, 'success');
        animateBalance('as-points-balance', newBalance - points, newBalance);
        updateUI();
    } catch (error) {
        console.error("Error updating balance or logging task:", error);
        showToast('Failed to update points. Please try again.', 'error');
    }
}

// --- UI Update Functions ---
function updateUI() {
    if (!currentUser) {
        if (document.getElementById('profile-name')) document.getElementById('profile-name').textContent = 'Login Required';
        if (document.getElementById('as-points-balance')) document.getElementById('as-points-balance').textContent = '0';
        return;
    }

    // Home Screen
    if (document.getElementById('profile-name')) document.getElementById('profile-name').textContent = currentUser.telegram_profile_name || currentUser.telegram_username;
    // Only animate if the balance is actually different from what's displayed
    const currentDisplayedBalance = parseInt(document.getElementById('as-points-balance')?.textContent.replace(/,/g, '') || '0') || 0;
    if (currentDisplayedBalance !== currentUser.current_balance_as) {
        animateBalance('as-points-balance', currentDisplayedBalance, currentUser.current_balance_as);
    } else {
        if (document.getElementById('as-points-balance')) document.getElementById('as-points-balance').textContent = (currentUser.current_balance_as || 0).toLocaleString();
    }

    updateCheckinUI();
    updateSummaryUI();

    // Ads Task Screen
    updateAdsTaskUI();

    // Telegram Tasks Screen
    updateTgTasksUI();

    // Referral Screen
    if (document.getElementById('my-referral-code')) document.getElementById('my-referral-code').value = currentUser.referral_code || 'Loading...';
    if (document.getElementById('total-referrals')) document.getElementById('total-referrals').textContent = (currentUser.referrals_count || 0).toLocaleString();
    if (currentUser.has_submitted_referral) {
        if (document.getElementById('enter-referral-code')) document.getElementById('enter-referral-code').disabled = true;
        if (document.getElementById('submit-referral-code-btn')) document.getElementById('submit-referral-code-btn').disabled = true;
        if (document.getElementById('referral-input-message')) {
            document.getElementById('referral-input-message').textContent = 'You have already submitted a referral code.';
            document.getElementById('referral-input-message').style.color = 'yellow';
        }
    } else {
        if (document.getElementById('enter-referral-code')) document.getElementById('enter-referral-code').disabled = false;
        if (document.getElementById('submit-referral-code-btn')) document.getElementById('submit-referral-code-btn').disabled = false;
        if (document.getElementById('referral-input-message')) {
            document.getElementById('referral-input-message').textContent = '';
        }
        if (document.getElementById('enter-referral-code')) document.getElementById('enter-referral-code').value = '';
    }

    // Withdraw Screen
    updateWithdrawUI();
    // Only render withdrawal history if the screen is active to avoid unnecessary calls
    if (document.getElementById('withdraw-screen')?.classList.contains('active')) {
        renderWithdrawalHistory();
    }

    // Profile Screen
    if (document.getElementById('profile-tg-username')) document.getElementById('profile-tg-username').textContent = `@${currentUser.telegram_username || 'N/A'}`;
    if (document.getElementById('profile-tg-id')) document.getElementById('profile-tg-id').textContent = currentUser.user_id || 'N/A';
    if (document.getElementById('profile-full-name')) document.getElementById('profile-full-name').textContent = currentUser.telegram_profile_name || 'N/A';
    if (document.getElementById('profile-join-date')) document.getElementById('profile-join-date').textContent = currentUser.joined_at ? formatFirestoreTimestamp(currentUser.joined_at) : 'N/A';
    if (document.getElementById('profile-current-points')) document.getElementById('profile-current-points').textContent = (currentUser.current_balance_as || 0).toLocaleString();
    if (document.getElementById('profile-total-earned')) document.getElementById('profile-total-earned').textContent = (currentUser.total_earned_as || 0).toLocaleString();
    if (document.getElementById('profile-total-tasks')) document.getElementById('profile-total-tasks').textContent = (currentUser.total_tasks_completed || 0).toLocaleString();
    if (document.getElementById('profile-streak-day')) document.getElementById('profile-streak-day').textContent = (currentUser.streak_day || 0).toLocaleString();
    if (document.getElementById('profile-total-referrals')) document.getElementById('profile-total-referrals').textContent = (currentUser.referrals_count || 0).toLocaleString();
    // Only render task history if the profile screen is active and task tab is active
    if (document.getElementById('profile-screen')?.classList.contains('active') && document.querySelector('.history-tab[data-history-type="tasks"]')?.classList.contains('active')) {
        renderTaskHistory();
    }
}

async function updateSummaryUI() {
    if (!currentUser || !currentUser.user_id) return;

    const today = getTodayUTC();
    const tasksRef = db.collection('tasks')
                      .where('user_id', '==', currentUser.user_id)
                      .where('created_at', '>=', today)
                      .where('status', '==', 'COMPLETED'); // Only count completed tasks

    let adsEarnings = 0;
    let tgTasksEarnings = 0;
    let referralEarnings = 0;

    try {
        const snapshot = await tasksRef.get();
        snapshot.forEach(doc => {
            const task = doc.data();
            if (task.task_type === 'AD') {
                adsEarnings += task.reward_points;
            } else if (task.task_type === 'TG_JOIN') {
                tgTasksEarnings += task.reward_points;
            } else if (task.task_type === 'REFERRAL_CREDIT') { // Only count points user received for referring
                referralEarnings += task.reward_points;
            }
        });

        if (document.getElementById('summary-ads')) document.getElementById('summary-ads').textContent = `${adsEarnings.toFixed(1)} AS`;
        if (document.getElementById('summary-tg-tasks')) document.getElementById('summary-tg-tasks').textContent = `${tgTasksEarnings.toFixed(1)} AS`;
        if (document.getElementById('summary-referrals')) document.getElementById('summary-referrals').textContent = `${referralEarnings.toFixed(1)} AS`;
    } catch (error) {
        console.error("Error updating summary UI:", error);
    }
}


// --- Home Screen Logic (Daily Check-in) ---
async function updateCheckinUI() {
    if (!currentUser || !currentUser.user_id) { // Check for user_id to ensure logged in
        const claimBtn = document.getElementById('claim-checkin-btn');
        if (claimBtn) {
            claimBtn.disabled = true;
            claimBtn.textContent = 'Login to Claim';
        }
        const msg = document.getElementById('checkin-message');
        if (msg) msg.textContent = 'Please log in to start your streak.';
        const indicator = document.getElementById('streak-indicator');
        if(indicator) indicator.innerHTML = '<p class="info-text">Streak not available.</p>';
        return;
    }

    const today = getTodayUTC();
    const lastCheckinDate = currentUser.last_checkin_at ? currentUser.last_checkin_at.toDate() : null;
    let streakDay = currentUser.streak_day || 0;
    const claimButton = document.getElementById('claim-checkin-btn');
    const checkinMessage = document.getElementById('checkin-message');

    let canClaimToday = true;
    let nextReward = 1;

    if (lastCheckinDate) {
        const lastCheckinDay = new Date(Date.UTC(lastCheckinDate.getFullYear(), lastCheckinDate.getMonth(), lastCheckinDate.getDate()));
        const diffTime = Math.abs(today.getTime() - lastCheckinDay.getTime()); // Use getTime for accurate diff
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)); // Round to handle potential daylight saving issues

        if (diffDays === 0) { // Already checked in today
            canClaimToday = false;
            if (checkinMessage) checkinMessage.textContent = `You've already claimed your Day ${streakDay} reward today. Come back tomorrow!`;
            nextReward = getCheckinReward(streakDay === 7 ? 1 : streakDay + 1);
        } else if (diffDays === 1) { // Consecutive day
            streakDay = (streakDay % 7) + 1; // Correctly cycle from day 7 to day 1
            nextReward = getCheckinReward(streakDay);
            if (checkinMessage) checkinMessage.textContent = `Claim your Day ${streakDay} reward!`;
        } else { // Missed a day
            streakDay = 1; // Reset streak
            nextReward = getCheckinReward(streakDay);
            if (checkinMessage) checkinMessage.textContent = `Streak reset. Claim Day 1 reward to restart!`;
        }
    } else { // Never checked in
        streakDay = 1;
        nextReward = getCheckinReward(streakDay);
        if (checkinMessage) checkinMessage.textContent = `Start your streak! Claim Day 1 reward.`;
    }

    if(claimButton) {
        claimButton.disabled = !canClaimToday;
        claimButton.textContent = `Claim Day ${streakDay} (${nextReward} AS Points)`;
    }


    // Render streak capsules
    const streakIndicator = document.getElementById('streak-indicator');
    if (!streakIndicator) return;
    streakIndicator.innerHTML = '';
    const checkinRewards = [1, 2, 4, 6, 10, 15, 20]; // Just for reference, not used in rendering logic here

    for (let i = 0; i < 7; i++) {
        const dayNum = i + 1;
        const capsule = document.createElement('div');
        capsule.className = 'streak-capsule';
        capsule.textContent = `Day ${dayNum}`;

        // Logic to determine capsule styling
        const lastClaimedDay = currentUser.streak_day || 0;
        const hasClaimedToday = (lastCheckinDate && lastCheckinDate.toDateString() === today.toDateString());

        if (hasClaimedToday) {
            if (dayNum <= lastClaimedDay) {
                capsule.classList.add('completed');
            }
        } else { // Can claim today or missed streak
            if (dayNum < streakDay) { // Past days in current valid streak
                capsule.classList.add('completed');
            } else if (dayNum === streakDay) { // Current day to claim
                capsule.classList.add('active');
            }
        }
        streakIndicator.appendChild(capsule);
    }
}

function getCheckinReward(day) {
    switch (day) {
        case 1: return 1;
        case 2: return 2;
        case 3: return 4;
        case 4: return 6;
        case 5: return 10;
        case 6: return 15;
        case 7: return 20;
        default: return 0;
    }
}

document.getElementById('claim-checkin-btn')?.addEventListener('click', async () => {
    if (!currentUser || !currentUser.user_id || document.getElementById('claim-checkin-btn').disabled) return;

    const today = getTodayUTC();
    const lastCheckinDate = currentUser.last_checkin_at ? currentUser.last_checkin_at.toDate() : null;
    let currentStreakDay = currentUser.streak_day || 0;

    let reward = 0;
    let newStreakDay = 0;

    if (lastCheckinDate) {
        const lastCheckinDay = new Date(Date.UTC(lastCheckinDate.getFullYear(), lastCheckinDate.getMonth(), lastCheckinDate.getDate()));
        const diffTime = Math.abs(today.getTime() - lastCheckinDay.getTime());
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            showToast('You have already claimed your daily reward!', 'info');
            return;
        } else if (diffDays === 1) { // Consecutive day
            newStreakDay = (currentStreakDay % 7) + 1;
            reward = getCheckinReward(newStreakDay);
        } else { // Missed a day
            newStreakDay = 1; // Reset streak
            reward = getCheckinReward(newStreakDay);
        }
    } else { // First check-in ever
        newStreakDay = 1;
        reward = getCheckinReward(newStreakDay);
    }

    const userRef = db.collection('users').doc(currentUser.user_id);
    try {
        await userRef.update({
            current_balance_as: firebase.firestore.FieldValue.increment(reward),
            total_earned_as: firebase.firestore.FieldValue.increment(reward),
            total_tasks_completed: firebase.firestore.FieldValue.increment(1),
            streak_day: newStreakDay,
            last_checkin_at: firebase.firestore.FieldValue.serverTimestamp(),
        });

        currentUser.current_balance_as = (currentUser.current_balance_as || 0) + reward;
        currentUser.total_earned_as = (currentUser.total_earned_as || 0) + reward;
        currentUser.total_tasks_completed = (currentUser.total_tasks_completed || 0) + 1;
        currentUser.streak_day = newStreakDay;
        currentUser.last_checkin_at = firebase.firestore.Timestamp.now(); // Update locally for immediate UI refresh

        // Log the check-in task
        await db.collection('tasks').add({
            user_id: currentUser.user_id,
            task_type: 'CHECKIN',
            reference: `Day ${newStreakDay}`,
            reward_points: reward,
            status: 'COMPLETED',
            created_at: firebase.firestore.FieldValue.serverTimestamp(),
            meta: {},
        });

        showToast(`Claimed Day ${newStreakDay}: +${reward} AS Points!`, 'success');
        animateBalance('as-points-balance', currentUser.current_balance_as - reward, currentUser.current_balance_as);
        updateCheckinUI(); // Refresh UI
        updateSummaryUI();
    } catch (error) {
        console.error("Error claiming check-in:", error);
        showToast('Failed to claim daily reward. Please try again.', 'error');
        if (document.getElementById('claim-checkin-btn')) document.getElementById('claim-checkin-btn').disabled = false; // Re-enable button on error
    }
});


// --- ADS Task Section Logic ---
async function updateAdsTaskUI() {
    if (!currentUser || !currentUser.user_id) {
        const startAdBtn = document.getElementById('start-ad-task-btn');
        if(startAdBtn) {
            startAdBtn.disabled = true;
            startAdBtn.textContent = "Login Required";
        }
        if (document.getElementById('daily-ads-left')) document.getElementById('daily-ads-left').textContent = 'N/A';
        if (document.getElementById('hourly-ads-left')) document.getElementById('hourly-ads-left').textContent = 'N/A';
        if (document.getElementById('lifetime-ads-completed')) document.getElementById('lifetime-ads-completed').textContent = 'N/A';
        return;
    }

    const userRef = db.collection('users').doc(currentUser.user_id);
    const now = firebase.firestore.Timestamp.now().toDate();
    const todayUTC = getTodayUTC();

    let adsDailyCount = currentUser.ads_daily_count || 0;
    let adsHourlyCount = currentUser.ads_hourly_count || 0;
    let adsLastHourReset = currentUser.ads_last_hour_reset ? currentUser.ads_last_hour_reset.toDate() : now;

    try {
        // Reset daily count if day has changed (UTC)
        const lastSeenDateUTC = currentUser.last_seen_at ? currentUser.last_seen_at.toDate() : new Date(0);
        const lastSeenDayUTC = new Date(Date.UTC(lastSeenDateUTC.getUTCFullYear(), lastSeenDateUTC.getUTCMonth(), lastSeenDateUTC.getUTCDate()));

        if (todayUTC.getTime() > lastSeenDayUTC.getTime()) { // Check if today is strictly after the last seen day
            adsDailyCount = 0;
            // Only update Firestore if a change is needed
            if (currentUser.ads_daily_count !== 0) await userRef.update({ ads_daily_count: 0 });
            currentUser.ads_daily_count = 0;
        }

        // Reset hourly count if an hour has passed
        if ((now.getTime() - adsLastHourReset.getTime()) / (1000 * 60 * 60) >= 1) {
            adsHourlyCount = 0;
            adsLastHourReset = now; // Set to current time
            // Only update Firestore if a change is needed
            if (currentUser.ads_hourly_count !== 0 || (currentUser.ads_last_hour_reset && currentUser.ads_last_hour_reset.toDate().getTime() !== now.getTime())) {
                 await userRef.update({ ads_hourly_count: 0, ads_last_hour_reset: firebase.firestore.FieldValue.serverTimestamp() });
            }
            currentUser.ads_hourly_count = 0;
            currentUser.ads_last_hour_reset = firebase.firestore.Timestamp.now(); // Update local object
        }

        const lifetimeAdsCompleted = (await db.collection('tasks')
                                            .where('user_id', '==', currentUser.user_id)
                                            .where('task_type', '==', 'AD')
                                            .where('status', '==', 'COMPLETED')
                                            .get()).size;


        if (document.getElementById('daily-ads-left')) document.getElementById('daily-ads-left').textContent = Math.max(0, MAX_ADS_DAILY - adsDailyCount);
        if (document.getElementById('hourly-ads-left')) document.getElementById('hourly-ads-left').textContent = Math.max(0, MAX_ADS_HOURLY - adsHourlyCount);
        if (document.getElementById('lifetime-ads-completed')) document.getElementById('lifetime-ads-completed').textContent = lifetimeAdsCompleted;

        const startAdBtn = document.getElementById('start-ad-task-btn');
        if(startAdBtn) {
            if (adsDailyCount >= MAX_ADS_DAILY || adsHourlyCount >= MAX_ADS_HOURLY) {
                startAdBtn.disabled = true;
                startAdBtn.textContent = "Ad Limit Reached";
                showToast('You have reached your daily or hourly ad limit.', 'info');
            } else {
                startAdBtn.disabled = false;
                startAdBtn.textContent = "Start Ad Task";
            }
        }
    } catch (error) {
        console.error("Error updating ads task UI:", error);
        showToast('Failed to load ad task data.', 'error');
        if (document.getElementById('start-ad-task-btn')) document.getElementById('start-ad-task-btn').disabled = true; // Disable button on error
    }
}

document.getElementById('start-ad-task-btn')?.addEventListener('click', async () => {
    if (!currentUser || !currentUser.user_id || document.getElementById('start-ad-task-btn').disabled) return;

    // Client-side rate limit check (backend required for true security)
    if ((currentUser.ads_daily_count || 0) >= MAX_ADS_DAILY || (currentUser.ads_hourly_count || 0) >= MAX_ADS_HOURLY) {
        showToast('Ad limit reached. Please try again later.', 'info');
        updateAdsTaskUI(); // Refresh UI in case of discrepancy
        return;
    }

    showToast('Loading ad...', 'info');
    if (document.getElementById('start-ad-task-btn')) document.getElementById('start-ad-task-btn').disabled = true;

    try {
        // Monetag Rewarded interstitial
        // show_9725833() is a global function provided by the Monetag SDK
        // Make sure the Monetag script is loaded in index.html
        if (typeof show_9725833 !== 'function') {
            throw new Error("Monetag SDK function show_9725833 not found. Ensure Monetag script is loaded.");
        }

        show_9725833().then(async () => {
            // This block executes if the user successfully watches the ad
            const userRef = db.collection('users').doc(currentUser.user_id);
            const now = firebase.firestore.Timestamp.now();

            // Update user's ad counters and balance
            await userRef.update({
                current_balance_as: firebase.firestore.FieldValue.increment(ADS_REWARD_POINTS),
                total_earned_as: firebase.firestore.FieldValue.increment(ADS_REWARD_POINTS),
                total_tasks_completed: firebase.firestore.FieldValue.increment(1),
                ads_daily_count: firebase.firestore.FieldValue.increment(1),
                ads_hourly_count: firebase.firestore.FieldValue.increment(1),
                ads_last_hour_reset: now, // Update last reset time to now
            });
            // Update local currentUser object
            currentUser.current_balance_as = (currentUser.current_balance_as || 0) + ADS_REWARD_POINTS;
            currentUser.total_earned_as = (currentUser.total_earned_as || 0) + ADS_REWARD_POINTS;
            currentUser.total_tasks_completed = (currentUser.total_tasks_completed || 0) + 1;
            currentUser.ads_daily_count = (currentUser.ads_daily_count || 0) + 1;
            currentUser.ads_hourly_count = (currentUser.ads_hourly_count || 0) + 1;
            currentUser.ads_last_hour_reset = now;

            // Log the ad completion
            const adTaskId = `AD_${Date.now()}_${currentUser.user_id}`; // Simple unique ID
            await db.collection('tasks').add({
                user_id: currentUser.user_id,
                task_type: 'AD',
                reference: adTaskId, // Can store Monetag transaction ID if available
                reward_points: ADS_REWARD_POINTS,
                status: 'COMPLETED',
                created_at: now,
                meta: { monetag_zone: '9725833' },
            });

            showToast(`+${ADS_REWARD_POINTS} AS Points!`, 'success');
            animateBalance('as-points-balance', currentUser.current_balance_as - ADS_REWARD_POINTS, currentUser.current_balance_as);
            updateAdsTaskUI(); // Refresh UI with new counts
            updateSummaryUI();
            if (document.getElementById('start-ad-task-btn')) document.getElementById('start-ad-task-btn').disabled = false; // Re-enable button
        }).catch(error => {
            console.error('Monetag ad failed or was not shown:', error);
            showToast('Ad could not be loaded or was dismissed.', 'error');
            if (document.getElementById('start-ad-task-btn')) document.getElementById('start-ad-task-btn').disabled = false; // Re-enable button
            updateAdsTaskUI(); // Refresh UI in case of error
        });

    } catch (e) {
        console.error("Error displaying ad:", e);
        showToast('Failed to load ad. Please try again.', 'error');
        if (document.getElementById('start-ad-task-btn')) document.getElementById('start-ad-task-btn').disabled = false; // Re-enable button
    }
});


// --- Telegram Tasks Section Logic ---
async function updateTgTasksUI() {
    if (!currentUser || !currentUser.user_id) {
        document.querySelectorAll('.tg-tasks-card .task-item').forEach(item => {
            const joinButton = item.querySelector('.join-tg-task-btn');
            const statusSpan = item.querySelector('.task-status');
            item.classList.remove('completed');
            if (joinButton) {
                joinButton.style.display = '';
                joinButton.disabled = true;
                joinButton.classList.add('greyed-out');
                joinButton.textContent = 'Login Required';
            }
            if (statusSpan) statusSpan.innerHTML = '';
        });
        return;
    }

    const taskItems = document.querySelectorAll('.tg-tasks-card .task-item');
    for (const item of taskItems) {
        const taskId = item.dataset.taskId;
        const joinButton = item.querySelector('.join-tg-task-btn');
        const statusSpan = item.querySelector('.task-status');

        if (currentUser.tg_tasks_completed && currentUser.tg_tasks_completed.includes(taskId)) {
            item.classList.add('completed');
            if (joinButton) joinButton.style.display = 'none';
            if (statusSpan) statusSpan.innerHTML = '<i class="fas fa-check-circle"></i>';
        } else {
            item.classList.remove('completed');
            if (joinButton) {
                joinButton.style.display = '';
                joinButton.disabled = false; // Enable by default
                joinButton.classList.remove('greyed-out');
                joinButton.innerHTML = `Join <i class="fas fa-arrow-right"></i>`;
            }
            if (statusSpan) statusSpan.innerHTML = '';
        }
    }
}

document.querySelectorAll('.join-tg-task-btn').forEach(button => {
    button.addEventListener('click', async (event) => {
        if (!currentUser || !currentUser.user_id) {
            showToast('Please log in to perform this action.', 'error');
            return;
        }

        const item = event.target.closest('.task-item');
        const taskId = item.dataset.taskId;
        const taskLink = item.dataset.link;
        const joinButton = item.querySelector('.join-tg-task-btn');

        if (currentUser.tg_tasks_completed && currentUser.tg_tasks_completed.includes(taskId)) {
            showToast('You have already completed this task.', 'info');
            return;
        }

        // Disable button to prevent double-click
        if (joinButton) {
            joinButton.disabled = true;
            joinButton.textContent = 'Verifying...';
        }


        // 1. Redirect user to Telegram link
        try {
            Telegram.WebApp.openTelegramLink(taskLink);
            showToast('Redirecting to Telegram. Please join and come back to verify.', 'info');
        } catch (error) {
            console.error("Error opening Telegram link:", error);
            showToast('Failed to open Telegram link. Please try manually.', 'error');
            if (joinButton) {
                joinButton.disabled = false;
                joinButton.innerHTML = `Join <i class="fas fa-arrow-right"></i>`;
            }
            return;
        }


        // 2. Verification (THIS PART NEEDS A BACKEND BOT FOR REAL VERIFICATION)
        // For this client-side demo, we'll simulate verification after a delay.
        // In a real scenario, the user would click a "Verify" button *after* joining,
        // which would trigger a backend call to your bot to check membership.
        setTimeout(async () => {
            const isVerified = true; // Assume success for client-side demo
            // In a real app, this would be a server-side call:
            // const isVerified = await checkTelegramMembership(currentUser.user_id, taskLink);

            if (isVerified) {
                const userRef = db.collection('users').doc(currentUser.user_id);
                const newTgTasksCompleted = [...(currentUser.tg_tasks_completed || []), taskId];

                try {
                    await userRef.update({
                        current_balance_as: firebase.firestore.FieldValue.increment(TG_TASK_REWARD_POINTS),
                        total_earned_as: firebase.firestore.FieldValue.increment(TG_TASK_REWARD_POINTS),
                        total_tasks_completed: firebase.firestore.FieldValue.increment(1),
                        tg_tasks_completed: newTgTasksCompleted,
                    });

                    currentUser.current_balance_as = (currentUser.current_balance_as || 0) + TG_TASK_REWARD_POINTS;
                    currentUser.total_earned_as = (currentUser.total_earned_as || 0) + TG_TASK_REWARD_POINTS;
                    currentUser.total_tasks_completed = (currentUser.total_tasks_completed || 0) + 1;
                    currentUser.tg_tasks_completed = newTgTasksCompleted;

                    // Log the task
                    await db.collection('tasks').add({
                        user_id: currentUser.user_id,
                        task_type: 'TG_JOIN',
                        reference: taskLink,
                        reward_points: TG_TASK_REWARD_POINTS,
                        status: 'COMPLETED',
                        created_at: firebase.firestore.FieldValue.serverTimestamp(),
                        meta: { task_id: taskId },
                    });

                    showToast(`+${TG_TASK_REWARD_POINTS} AS Points for joining!`, 'success');
                    animateBalance('as-points-balance', currentUser.current_balance_as - TG_TASK_REWARD_POINTS, currentUser.current_balance_as);
                    updateTgTasksUI(); // Refresh UI
                    updateSummaryUI();

                    // Check if initial tasks completed for referral eligibility
                    await checkReferralEligibility(currentUser.user_id);

                } catch (error) {
                    console.error("Error completing TG task:", error);
                    showToast('Failed to complete Telegram task. Please try again.', 'error');
                    if (joinButton) {
                        joinButton.disabled = false;
                        joinButton.innerHTML = `Join <i class="fas fa-arrow-right"></i>`;
                    }
                }

            } else {
                showToast('Failed to verify join. Please ensure you joined the channel/group.', 'error');
                if (joinButton) {
                    joinButton.disabled = false; // Re-enable button
                    joinButton.innerHTML = `Join <i class="fas fa-arrow-right"></i>`;
                }
            }
        }, 5000); // Simulate verification delay
    });
});

// --- Referral System Logic ---
document.getElementById('copy-referral-code-btn')?.addEventListener('click', async () => {
    const referralCodeInput = document.getElementById('my-referral-code');
    if (!referralCodeInput) return; // Defensive check
    try {
        await navigator.clipboard.writeText(referralCodeInput.value);
        showToast('Referral code copied to clipboard!', 'info');
        // Animation feedback
        const copyButton = document.getElementById('copy-referral-code-btn');
        if (copyButton) {
            copyButton.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
                copyButton.innerHTML = '<i class="far fa-copy"></i>';
            }, 1500);
        }
    } catch (err) {
        showToast('Failed to copy referral code.', 'error');
        console.error('Failed to copy: ', err);
    }
});

document.getElementById('submit-referral-code-btn')?.addEventListener('click', async () => {
    if (!currentUser || !currentUser.user_id) {
        showToast('Please log in to perform this action.', 'error');
        return;
    }
    if (currentUser.has_submitted_referral) {
        showToast('You have already submitted a referral code.', 'info');
        return;
    }

    const enteredCode = document.getElementById('enter-referral-code').value.trim();
    if (!enteredCode) {
        showToast('Please enter a referral code.', 'error');
        return;
    }

    if (enteredCode === currentUser.referral_code) {
        showToast('You cannot refer yourself!', 'error');
        return;
    }

    const referralInputMessage = document.getElementById('referral-input-message');
    if (referralInputMessage) {
        referralInputMessage.textContent = 'Verifying referral code...';
        referralInputMessage.style.color = 'yellow';
    }


    // Find referrer by code
    try {
        const referrerQuery = await db.collection('users').where('referral_code', '==', enteredCode).limit(1).get();

        if (referrerQuery.empty) {
            showToast('Invalid referral code.', 'error');
            if (referralInputMessage) {
                referralInputMessage.textContent = 'Invalid referral code.';
                referralInputMessage.style.color = 'red';
            }
            return;
        }

        const referrerDoc = referrerQuery.docs[0];
        const referrerData = referrerDoc.data();
        const referrerId = referrerData.user_id;

        // Check if this user was already referred by someone else
        if (currentUser.referred_by && currentUser.referred_by !== referrerId) {
            showToast('You have already been referred by another user.', 'error');
            if (referralInputMessage) {
                referralInputMessage.textContent = 'You have already been referred.';
                referralInputMessage.style.color = 'red';
            }
            return;
        }

        // Update current user's referred_by and flag
        const userRef = db.collection('users').doc(currentUser.user_id);
        await userRef.update({
            referred_by: referrerId,
            has_submitted_referral: true,
        });
        currentUser.referred_by = referrerId;
        currentUser.has_submitted_referral = true;

        // Give referred user their bonus points
        await updateUserBalance(REFERRED_USER_BONUS_POINTS, 'REFERRAL_BONUS_RECEIVED', referrerId, { referred_by_code: enteredCode });
        showToast(`You received ${REFERRED_USER_BONUS_POINTS} AS Points for using a referral code!`, 'success');

        // Check if referred user (current user) has completed initial tasks
        await checkReferralEligibility(currentUser.user_id);

        if (document.getElementById('enter-referral-code')) document.getElementById('enter-referral-code').disabled = true;
        if (document.getElementById('submit-referral-code-btn')) document.getElementById('submit-referral-code-btn').disabled = true;
        if (referralInputMessage) {
            referralInputMessage.textContent = `Referral code "${enteredCode}" applied! You earned ${REFERRED_USER_BONUS_POINTS} AS.`;
            referralInputMessage.style.color = 'var(--success-color)';
        }
        updateUI();
    } catch (error) {
        console.error("Error submitting referral code:", error);
        showToast('Failed to submit referral code. Please try again.', 'error');
        if (referralInputMessage) {
            referralInputMessage.textContent = 'Failed to submit referral code.';
            referralInputMessage.style.color = 'red';
        }
    }
});

async function checkReferralEligibility(userId) {
    if (!userId) return;

    const userRef = db.collection('users').doc(userId);
    try {
        const userDoc = await userRef.get();
        const userData = userDoc.data();

        if (!userData || userData.initial_tasks_completed) {
            return; // Already completed or user not found
        }

        const tgTasksCount = (userData.tg_tasks_completed || []).length;
        const adsTasksCount = (await db.collection('tasks')
                                    .where('user_id', '==', userId)
                                    .where('task_type', '==', 'AD')
                                    .where('status', '==', 'COMPLETED')
                                    .get()).size;

        if (tgTasksCount >= REQUIRED_TG_TASKS_FOR_REFERRAL && adsTasksCount >= REQUIRED_ADS_FOR_REFERRAL) {
            await userRef.update({ initial_tasks_completed: true });
            userData.initial_tasks_completed = true; // Update local copy

            // If this user was referred, credit the referrer
            if (userData.referred_by) {
                await creditReferrer(userData.referred_by, userId);
            }
            showToast('Initial onboarding tasks completed! You are now fully onboarded.', 'success');
        }
    } catch (error) {
        console.error("Error checking referral eligibility:", error);
    }
}

async function creditReferrer(referrerId, referredUserId) {
    const referrerRef = db.collection('users').doc(referrerId);
    try {
        const referrerDoc = await referrerRef.get();
        if (!referrerDoc.exists) {
            console.error(`Referrer with ID ${referrerId} not found.`);
            return;
        }

        // Check if referrer has already been credited for this specific referral
        const existingCredit = await db.collection('tasks')
                                    .where('user_id', '==', referrerId)
                                    .where('task_type', '==', 'REFERRAL_CREDIT')
                                    .where('meta.referred_user_id', '==', referredUserId)
                                    .limit(1).get();

        if (!existingCredit.empty) {
            console.log(`Referrer ${referrerId} already credited for ${referredUserId}.`);
            return;
        }

        await referrerRef.update({
            current_balance_as: firebase.firestore.FieldValue.increment(REFERRER_REWARD_POINTS),
            total_earned_as: firebase.firestore.FieldValue.increment(REFERRER_REWARD_POINTS),
            referrals_count: firebase.firestore.FieldValue.increment(1),
        });

        // Log the referral credit for the referrer
        await db.collection('tasks').add({
            user_id: referrerId,
            task_type: 'REFERRAL_CREDIT',
            reference: `Referred by ${referredUserId}`,
            reward_points: REFERRER_REWARD_POINTS,
            status: 'COMPLETED',
            created_at: firebase.firestore.FieldValue.serverTimestamp(),
            meta: { referred_user_id: referredUserId },
        });

        showToast(`Your referral earned you ${REFERRER_REWARD_POINTS} AS Points!`, 'success');
        console.log(`Referrer ${referrerId} credited for referring ${referredUserId}.`);

        // Optionally update local currentUser if it's the referrer
        if (currentUser && currentUser.user_id === referrerId) {
            currentUser.current_balance_as = (currentUser.current_balance_as || 0) + REFERRER_REWARD_POINTS;
            currentUser.total_earned_as = (currentUser.total_earned_as || 0) + REFERRER_REWARD_POINTS;
            currentUser.referrals_count = (currentUser.referrals_count || 0) + 1;
            updateUI();
        }
    } catch (error) {
        console.error("Error crediting referrer:", error);
        showToast('Failed to credit referrer. Please contact support.', 'error');
    }
}


// --- Withdraw Section Logic ---
function updateWithdrawUI() {
    if (!currentUser || !currentUser.user_id) {
        const withdrawBinanceBtn = document.getElementById('withdraw-binance-btn');
        const withdrawGooglePlayBtn = document.getElementById('withdraw-google-play-btn');
        if (withdrawBinanceBtn) {
            withdrawBinanceBtn.disabled = true;
            withdrawBinanceBtn.textContent = 'Login Required';
        }
        if (withdrawGooglePlayBtn) {
            withdrawGooglePlayBtn.disabled = true;
            withdrawGooglePlayBtn.textContent = 'Login Required';
        }
        document.getElementById('binance-option')?.classList.add('locked');
        document.getElementById('google-play-option')?.classList.add('locked');
        return;
    }

    const binanceOption = document.getElementById('binance-option');
    const googlePlayOption = document.getElementById('google-play-option');
    const withdrawBinanceBtn = document.getElementById('withdraw-binance-btn');
    const withdrawGooglePlayBtn = document.getElementById('withdraw-google-play-btn');

    const canWithdrawBinance = (currentUser.current_balance_as || 0) >= BINANCE_WITHDRAW_POINTS;
    const canWithdrawGooglePlay = (currentUser.current_balance_as || 0) >= GOOGLE_PLAY_WITHDRAW_POINTS;

    if (binanceOption) binanceOption.classList.toggle('locked', !canWithdrawBinance);
    if (googlePlayOption) googlePlayOption.classList.toggle('locked', !canWithdrawGooglePlay);

    if (withdrawBinanceBtn) {
        withdrawBinanceBtn.disabled = !canWithdrawBinance;
        withdrawBinanceBtn.textContent = 'Withdraw to Binance'; // Reset text
        withdrawBinanceBtn.classList.toggle('active-glow', canWithdrawBinance);
    }
    if (withdrawGooglePlayBtn) {
        withdrawGooglePlayBtn.disabled = !canWithdrawGooglePlay;
        withdrawGooglePlayBtn.textContent = 'Withdraw Google Play'; // Reset text
        withdrawGooglePlayBtn.classList.toggle('active-glow', canWithdrawGooglePlay);
    }
}

document.getElementById('withdraw-binance-btn')?.addEventListener('click', async () => {
    if (!currentUser || !currentUser.user_id || document.getElementById('withdraw-binance-btn').disabled) return;

    const binancePayId = document.getElementById('binance-pay-id').value.trim();
    if (!binancePayId) {
        showToast('Please enter your Binance Pay ID.', 'error');
        return;
    }

    // Basic ID validation (Binance Pay IDs are usually alphanumeric, 16-20 chars)
    if (!/^[a-zA-Z0-9]{16,20}$/.test(binancePayId)) {
        showToast('Invalid Binance Pay ID format. It should be 16-20 alphanumeric characters.', 'error');
        return;
    }

    await requestWithdrawal('BINANCE', BINANCE_WITHDRAW_POINTS, 0.9, binancePayId);
});

document.getElementById('withdraw-google-play-btn')?.addEventListener('click', async () => {
    if (!currentUser || !currentUser.user_id || document.getElementById('withdraw-google-play-btn').disabled) return;

    const email = document.getElementById('google-play-email').value.trim();
    if (!email) {
        showToast('Please enter your email address.', 'error');
        return;
    }

    // Basic email validation
    if (!/\S+@\S+\.\S+/.test(email)) {
        showToast('Invalid email address format.', 'error');
        return;
    }

    await requestWithdrawal('GOOGLE_PLAY', GOOGLE_PLAY_WITHDRAW_POINTS, 0.5, email);
});

async function requestWithdrawal(method, points, usdValue, recipient) {
    if (!currentUser || !currentUser.user_id) {
        showToast('User not logged in. Cannot process withdrawal.', 'error');
        return;
    }
    if ((currentUser.current_balance_as || 0) < points) {
        showToast('Insufficient AS Points for this withdrawal.', 'error');
        return;
    }

    showToast('Submitting withdrawal request...', 'info');
    // Disable buttons to prevent double submission
    const withdrawBinanceBtn = document.getElementById('withdraw-binance-btn');
    const withdrawGooglePlayBtn = document.getElementById('withdraw-google-play-btn');
    if (withdrawBinanceBtn) withdrawBinanceBtn.disabled = true;
    if (withdrawGooglePlayBtn) withdrawGooglePlayBtn.disabled = true;


    try {
        const withdrawalRef = await db.collection('withdrawals').add({
            user_id: currentUser.user_id,
            method: method,
            amount_as_points: points,
            est_usd_value: usdValue,
            recipient: recipient,
            status: 'PENDING',
            created_at: firebase.firestore.FieldValue.serverTimestamp(),
            updated_at: firebase.firestore.FieldValue.serverTimestamp(),
            admin_note: '',
        });

        // Deduct points from user balance
        const userRef = db.collection('users').doc(currentUser.user_id);
        await userRef.update({
            current_balance_as: firebase.firestore.FieldValue.increment(-points),
        });
        currentUser.current_balance_as = (currentUser.current_balance_as || 0) - points; // Update local state immediately

        showToast('Withdrawal request submitted! It will be reviewed by admin.', 'success');
        animateBalance('as-points-balance', currentUser.current_balance_as + points, currentUser.current_balance_as);
        updateUI(); // Refresh UI to reflect new balance and history

        // --- Telegram Channel Notification (Backend Required) ---
        const withdrawalTime = new Date().toLocaleString();
        const message = `💸 NEW WITHDRAWAL REQUEST RECEIVED! 💸

👤 Name: ${currentUser.telegram_profile_name || 'N/A'}
🔗 Username: @${currentUser.telegram_username || 'N/A'}
🆔 User ID: ${currentUser.user_id}
💰 AS Points: ${points}
💳 Payment Method: ${method === 'BINANCE' ? 'Binance Pay' : 'Google Play Code'}
⏳ Status: 🔴 Pending (Under Review)
🕒 Request Time: ${withdrawalTime}

⚡ Our team will review this request shortly. Once verified, the status will be updated to ✅ Successful or ❌ Rejected. Stay tuned!`;

        console.log("Simulating Telegram channel notification:\n", message);
        console.warn("To send this message to Telegram channel " + WITHDRAW_CHANNEL_ID + ", you need a backend server (e.g., Firebase Cloud Function, Node.js server) to interact with the Telegram Bot API. Client-side JavaScript cannot do this directly for security reasons, as it would expose your bot's private token.");
        // Example of what would happen on a backend (Pseudocode):
        // (This would be executed on your server, not in this client-side JS)
        // const botToken = "YOUR_BOT_FATHER_TOKEN"; // Stored securely on your server
        // const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
        // await fetch(apiUrl, {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({
        //         chat_id: WITHDRAW_CHANNEL_ID, // Use the provided channel ID
        //         text: message,
        //         parse_mode: 'Markdown',
        //     }),
        // });
        // --- End Telegram Channel Notification ---

    } catch (error) {
        console.error("Error requesting withdrawal:", error);
        showToast('Failed to submit withdrawal request. Please try again.', 'error');
        // If withdrawal failed, re-add points to user (important for data consistency)
        if (currentUser && currentUser.user_id) {
             const userRef = db.collection('users').doc(currentUser.user_id);
             await userRef.update({
                 current_balance_as: firebase.firestore.FieldValue.increment(points),
             });
             currentUser.current_balance_as = (currentUser.current_balance_as || 0) + points; // Revert local state
             updateUI();
        }
    } finally {
        // Re-enable buttons regardless of success or failure
        if (withdrawBinanceBtn) withdrawBinanceBtn.disabled = false;
        if (withdrawGooglePlayBtn) withdrawGooglePlayBtn.disabled = false;
        if (document.getElementById('binance-pay-id')) document.getElementById('binance-pay-id').value = '';
        if (document.getElementById('google-play-email')) document.getElementById('google-play-email').value = '';
    }
}

async function renderWithdrawalHistory() {
    const withdrawalListDiv = document.getElementById('withdrawal-list');
    if (!withdrawalListDiv) return;

    if (!currentUser || !currentUser.user_id) {
        withdrawalListDiv.innerHTML = '<p class="info-text">Please log in to see withdrawal history.</p>';
        return;
    }

    withdrawalListDiv.innerHTML = '<p class="info-text">Loading history...</p>';

    try {
        const withdrawalsSnapshot = await db.collection('withdrawals')
                                            .where('user_id', '==', currentUser.user_id)
                                            .orderBy('created_at', 'desc')
                                            .get();

        if (withdrawalsSnapshot.empty) {
            withdrawalListDiv.innerHTML = '<p class="info-text">No withdrawal history yet.</p>';
            return;
        }

        withdrawalListDiv.innerHTML = '';
        withdrawalsSnapshot.forEach(doc => {
            const withdrawal = doc.data();
            const item = document.createElement('div');
            item.className = `withdrawal-item ${withdrawal.status.toLowerCase()}`; // Reusing styling
            item.innerHTML = `
                <div><span class="label">Method:</span> <span class="value">${withdrawal.method === 'BINANCE' ? 'Binance Pay' : 'Google Play'}</span></div>
                <div><span class="label">Points:</span> <span class="value">${withdrawal.amount_as_points} AS</span></div>
                <div><span class="label">USD Value:</span> <span class="value">$${withdrawal.est_usd_value}</span></div>
                <div><span class="label">Recipient:</span> <span class="value">${withdrawal.recipient}</span></div>
                <div><span class="label">Status:</span> <span class="value status-text ${withdrawal.status.toLowerCase()}">${withdrawal.status}</span></div>
                <div><span class="label">Date:</span> <span class="value">${formatFirestoreTimestamp(withdrawal.created_at)}</span></div>
            `;
            withdrawalListDiv.appendChild(item);
        });
    } catch (error) {
        console.error("Error rendering withdrawal history (Firebase Rules?):", error);
        withdrawalListDiv.innerHTML = '<p class="info-text" style="color:red;">Failed to load withdrawal history. Check console for errors (e.g., Firebase rules).</p>';
    }
}


// --- Profile Section Logic (History) ---
document.querySelectorAll('.history-tab').forEach(tab => {
    tab.addEventListener('click', (event) => {
        document.querySelectorAll('.history-tab').forEach(t => t.classList.remove('active'));
        event.target.classList.add('active');

        const historyType = event.target.dataset.historyType;
        document.querySelectorAll('.history-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`history-content-${historyType}`)?.classList.add('active');

        if (historyType === 'tasks') {
            renderTaskHistory();
        } else if (historyType === 'withdrawals') {
            renderWithdrawalHistory();
        }
    });
});

async function renderTaskHistory() {
    const taskListDiv = document.getElementById('history-content-tasks');
    if (!taskListDiv) return;

    if (!currentUser || !currentUser.user_id) {
        taskListDiv.innerHTML = '<p class="info-text">Please log in to see task history.</p>';
        return;
    }

    taskListDiv.innerHTML = '<p class="info-text">Loading history...</p>';

    try {
        const tasksSnapshot = await db.collection('tasks')
                                      .where('user_id', '==', currentUser.user_id)
                                      .orderBy('created_at', 'desc')
                                      .get();

        if (tasksSnapshot.empty) {
            taskListDiv.innerHTML = '<p class="info-text">No task history yet.</p>';
            return;
        }

        taskListDiv.innerHTML = '';
        tasksSnapshot.forEach(doc => {
            const task = doc.data();
            const item = document.createElement('div');
            item.className = `withdrawal-item ${task.status.toLowerCase()}`; // Reusing styling for consistency
            item.innerHTML = `
                <div><span class="label">Type:</span> <span class="value">${task.task_type.replace(/_/g, ' ')}</span></div>
                <div><span class="label">Reward:</span> <span class="value">+${task.reward_points} AS</span></div>
                <div><span class="label">Ref:</span> <span class="value">${task.reference || 'N/A'}</span></div>
                <div><span class="label">Date:</span> <span class="value">${formatFirestoreTimestamp(task.created_at)}</span></div>
            `;
            taskListDiv.appendChild(item);
        });
    } catch (error) {
        console.error("Error rendering task history (Firebase Rules?):", error);
        taskListDiv.innerHTML = '<p class="info-text" style="color:red;">Failed to load task history. Check console for errors (e.g., Firebase rules).</p>';
    }
}


// --- Navigation Logic ---
const navItems = document.querySelectorAll('.bottom-nav .nav-item');
const screens = document.querySelectorAll('main .screen');

navItems.forEach(item => {
    item.addEventListener('click', async (event) => { // Made async to allow await calls for UI updates
        event.preventDefault(); // Prevent default link behavior
        const targetScreenId = item.dataset.screen;

        // Deactivate all nav items and screens
        navItems.forEach(nav => nav.classList.remove('active'));
        screens.forEach(screen => screen.classList.remove('active'));

        // Activate clicked nav item and corresponding screen
        item.classList.add('active');
        const targetScreen = document.getElementById(targetScreenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
        }

        // Update URL hash (optional, but good for back button)
        window.location.hash = targetScreenId.replace('-screen', '');

        // Re-run UI updates for the activated screen
        if (currentUser && currentUser.user_id) { // Ensure user data is available
            updateUI(); // General UI update
            if (targetScreenId === 'ads-task-screen') await updateAdsTaskUI();
            if (targetScreenId === 'tg-tasks-screen') await updateTgTasksUI();
            if (targetScreenId === 'withdraw-screen') await renderWithdrawalHistory();
            if (targetScreenId === 'profile-screen') {
                // Ensure correct history tab is active and rendered
                document.querySelectorAll('.history-tab').forEach(t => t.classList.remove('active'));
                document.querySelector('.history-tab[data-history-type="tasks"]')?.classList.add('active'); // Default to tasks tab
                document.querySelectorAll('.history-content').forEach(content => content.classList.remove('active'));
                document.getElementById('history-content-tasks')?.classList.add('active');
                await renderTaskHistory();
            }
        } else {
            // If currentUser is null, attempt to re-register/fetch data
            await registerOrUpdateUser();
        }
    });
});

// Handle initial screen based on URL hash or default to home
async function handleInitialScreen() {
    const hash = window.location.hash.substring(1);
    let targetScreenId = 'home-screen'; // Default screen

    if (hash) {
        const foundScreenLink = document.querySelector(`.nav-item[data-screen="${hash}-screen"]`);
        if (foundScreenLink) {
            targetScreenId = `${hash}-screen`;
        }
    }

    // Activate the corresponding nav item and screen
    navItems.forEach(item => {
        if (item.dataset.screen === targetScreenId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    screens.forEach(screen => {
        if (screen.id === targetScreenId) {
            screen.classList.add('active');
        } else {
            screen.classList.remove('active');
        }
    });

    // Run initial UI updates for the displayed screen
    // This will be called after registerOrUpdateUser
    if (currentUser && currentUser.user_id) { // Ensure currentUser is available after potential registration
        updateUI(); // General UI update
        if (targetScreenId === 'ads-task-screen') await updateAdsTaskUI();
        if (targetScreenId === 'tg-tasks-screen') await updateTgTasksUI();
        if (targetScreenId === 'withdraw-screen') await renderWithdrawalHistory();
        if (targetScreenId === 'profile-screen') {
            document.querySelectorAll('.history-tab').forEach(t => t.classList.remove('active'));
            document.querySelector('.history-tab[data-history-type="tasks"]')?.classList.add('active'); // Default to tasks tab
            document.querySelectorAll('.history-content').forEach(content => content.classList.remove('active'));
            document.getElementById('history-content-tasks')?.classList.add('active');
            await renderTaskHistory();
        }
    }
}


// --- Initialize App ---
document.addEventListener('DOMContentLoaded', async () => {
    // Attempt to register/update user. This will also call updateUI() on success.
    await registerOrUpdateUser();
    // After user is handled, set the initial screen and its specific UI.
    await handleInitialScreen();
});

// Listen for hash changes to navigate without full reload
window.addEventListener('hashchange', handleInitialScreen);