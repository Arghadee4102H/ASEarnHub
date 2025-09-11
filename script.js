// script.js

// --- Global Variables and Constants ---
let currentUser = null;
let telegramUserId = null;
let telegramUsername = 'N/A';
let telegramProfileName = 'N/A';
let monetagSdkLoaded = false; // Flag to check if Monetag SDK is ready
let currentActiveSection = 'home-section';

// Bot and Web App Details
const BOT_USERNAME = '@ASEarnHub_bot';
const WEBAPP_URL = 'http://t.me/ASEarnHub_bot/play';
const TELEGRAM_CHANNEL_FOR_WITHDRAWALS = '1002991582791'; // Placeholder for channel ID, actual ID is usually -100...

// --- Utility Functions ---

/**
 * Displays a toast notification.
 * @param {string} message The message to display.
 * @param {'success'|'error'|'info'} type The type of toast.
 * @param {number} duration Duration in ms.
 */
function showToast(message, type = 'info', duration = 3000) {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.classList.add('toast', type);
    let icon = '';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '❌';
    else icon = 'ℹ️';

    toast.innerHTML = `<span class="toast-icon">${icon}</span> ${message}`;
    toastContainer.appendChild(toast);

    // Optional: Fade out effect
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        toast.addEventListener('transitionend', () => toast.remove());
    }, duration - 500); // Start fade out 500ms before removal

    setTimeout(() => {
        if (toast.parentElement) toast.remove(); // Ensure it's removed if not faded
    }, duration);
}

/**
 * Animates a number counting up to a target value.
 * @param {HTMLElement} element The HTML element to update.
 * @param {number} start The starting number.
 * @param {number} end The target number.
 * @param {string} unit The unit to display (e.g., " AS").
 * @param {number} duration The duration of the animation in milliseconds.
 */
function animateNumber(element, start, end, unit = '', duration = 1000) {
    let startTime;
    const isInteger = end % 1 === 0;

    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    function animate(currentTime) {
        if (!startTime) startTime = currentTime;
        const progress = Math.min((currentTime - startTime) / duration, 1);
        const easedProgress = easeOutCubic(progress);
        const current = start + (end - start) * easedProgress;
        element.textContent = current.toFixed(isInteger ? 0 : 1) + unit;

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            element.textContent = end.toFixed(isInteger ? 0 : 1) + unit;
        }
    }
    requestAnimationFrame(animate);
}

/**
 * Formats a timestamp into a readable date string.
 * @param {firebase.firestore.Timestamp} timestamp
 * @returns {string}
 */
function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate();
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Formats a timestamp into a readable date and time string.
 * @param {firebase.firestore.Timestamp} timestamp
 * @returns {string}
 */
function formatDateTime(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate();
    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

/**
 * Simulates a server-side check for Telegram channel membership.
 * In a real app, this would be an API call to your bot backend.
 * @param {string} userId The Telegram user ID.
 * @param {string} channelLink The channel link (e.g., https://t.me/ASearnhub).
 * @returns {Promise<boolean>}
 */
async function checkTelegramMembership(userId, channelLink) {
    // This is a client-side simulation.
    // In a real application, you would send userId and channelLink to your backend.
    // Your backend bot would then use Telegram Bot API (getChatMember) to verify.
    // Example: https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getChatMember?chat_id=@channelusername&user_id=12345
    // For this client-side demo, we'll simulate success.
    console.warn(`[Client-side Simulation]: Verifying membership for user ${userId} in ${channelLink}.
                  In a real app, this needs a secure backend bot API call.`);
    return new Promise(resolve => {
        setTimeout(() => {
            // Simulate success. In a real app, this would be determined by backend.
            resolve(true);
        }, 1500);
    });
}

/**
 * Generates a referral code.
 * @param {string} username Telegram username.
 * @returns {string}
 */
function generateReferralCode(username) {
    if (!username || username === 'N/A') return 'AS_USER_ID_' + telegramUserId; // Fallback for users without username
    return 'AS' + username.replace(/[^a-zA-Z0-9]/g, ''); // Ensure valid characters
}

/**
 * Normalizes a date to the start of its UTC day (00:00:00.000 UTC).
 * @param {Date} date
 * @returns {Date}
 */
function startOfUtcDay(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
}

/**
 * Normalizes a date to the start of its UTC hour (HH:00:00.000 UTC).
 * @param {Date} date
 * @returns {Date}
 */
function startOfUtcHour(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), 0, 0, 0));
}


// --- Firebase Operations ---

/**
 * Gets or creates a user document in Firestore.
 * @param {string} userId
 * @param {string} username
 * @param {string} profileName
 * @returns {Promise<Object>} User data
 */
async function getOrCreateUser(userId, username, profileName) {
    const userRef = db.collection('users').doc(userId);
    const doc = await userRef.get();

    if (!doc.exists) {
        const userData = {
            telegram_username: username,
            telegram_profile_name: profileName,
            joined_at: firebase.firestore.FieldValue.serverTimestamp(),
            current_balance_as: 0,
            total_earned_as: 0,
            total_tasks_completed: 0,
            total_tasks_completed_ads: 0, // New field for ADS specific count
            total_tasks_completed_tg: 0, // New field for TG specific count
            total_checkins_completed: 0, // New field for checkins specific count
            referrals_count: 0,
            streak_day: 0,
            last_checkin_at: null,
            last_seen_at: firebase.firestore.FieldValue.serverTimestamp(),
            referred_by: null,
            referral_code: generateReferralCode(username),
            referred_bonus_given: false,
            referral_entry_completed: false, // Flag if this user has submitted *any* referral code
            ads_daily_count: 0,
            ads_hourly_count: 0,
            ads_last_hourly_reset: firebase.firestore.FieldValue.serverTimestamp(),
            ads_last_daily_reset: firebase.firestore.FieldValue.serverTimestamp()
        };
        await userRef.set(userData);
        showToast('Welcome to AS Earn Hub!', 'success');
        return userData;
    } else {
        // Update last_seen_at and possibly username/profile name
        await userRef.update({
            telegram_username: username,
            telegram_profile_name: profileName,
            last_seen_at: firebase.firestore.FieldValue.serverTimestamp()
        });
        return doc.data();
    }
}

/**
 * Checks if a user has completed the onboarding tasks for referral credit.
 * @param {string} userId The user ID of the referred user.
 * @returns {Promise<boolean>} True if onboarding tasks are completed, false otherwise.
 */
async function checkOnboardingTasksCompleted(userId) {
    // This function can be complex and should ideally be on the backend for security and accuracy.
    // For this client-side demo, we check if they have completed all 4 TG_JOIN tasks or 50 AD tasks.
    const tasksSnapshot = await db.collection('tasks')
        .where('user_id', '==', userId)
        .where('status', '==', 'COMPLETED')
        .get();

    let tgJoinTasksCompleted = new Set();
    let adsTasksCompletedCount = 0;

    tasksSnapshot.forEach(doc => {
        const task = doc.data();
        if (task.task_type === 'TG_JOIN') {
            tgJoinTasksCompleted.add(task.reference); // Use reference to count unique joins
        } else if (task.task_type === 'AD') {
            adsTasksCompletedCount++;
        }
    });

    // Check for all 4 unique Telegram channels
    const allTgChannelsJoined = tgJoinTasksCompleted.size >= 4;
    const fiftyAdsCompleted = adsTasksCompletedCount >= 50;

    return allTgChannelsJoined || fiftyAdsCompleted;
}

// --- UI Update Functions ---

/**
 * Updates the UI with current user data.
 */
function updateUI() {
    if (!currentUser) return;

    // Home Section
    document.getElementById('profile-display-name').textContent = currentUser.telegram_profile_name || 'User';
    // Adorable Avatars is deprecated. Using a simple alternative for demo.
    // In production, use a more reliable avatar service or allow user upload.
    document.getElementById('user-avatar').src = `https://api.multiavatar.com/${telegramUserId}.svg?seed=${telegramUserId}`;
    
    // Animate balance
    const currentBalanceEl = document.getElementById('as-points-balance');
    const oldBalance = parseFloat(currentBalanceEl.textContent) || 0;
    animateNumber(currentBalanceEl, oldBalance, currentUser.current_balance_as, ' AS');

    updateCheckinStreakUI();
    updateTodayEarningsSummary();

    // ADS Section
    document.getElementById('ads-daily-count').textContent = `${currentUser.ads_daily_count || 0}/200`;
    document.getElementById('ads-hourly-count').textContent = `${currentUser.ads_hourly_count || 0}/25`;
    document.getElementById('ads-lifetime-count').textContent = (currentUser.total_tasks_completed_ads || 0);

    // Referral Section
    document.getElementById('referral-code-field').value = currentUser.referral_code;
    document.getElementById('total-referrals-count').textContent = currentUser.referrals_count || 0;
    const submitReferralButton = document.getElementById('submit-referral-code-button');
    if (currentUser.referred_by || currentUser.referral_entry_completed) {
        document.getElementById('enter-referral-code-input').disabled = true;
        submitReferralButton.disabled = true;
        document.getElementById('referral-entry-message').textContent = 'You have already used a referral code.';
    } else {
        document.getElementById('enter-referral-code-input').disabled = false;
        submitReferralButton.disabled = false;
        document.getElementById('referral-entry-message').textContent = '';
    }
    updateReferralList();

    // Withdraw Section
    document.getElementById('withdraw-current-balance').textContent = currentUser.current_balance_as;
    checkWithdrawalButtonsState();
    if (currentActiveSection === 'withdraw-section' || (currentActiveSection === 'profile-section' && document.querySelector('.history-view-card .tab-button.active')?.dataset.historyType === 'withdrawals')) {
         updateWithdrawalHistory(); // Only update if on withdraw or profile/withdraw tab
    }
    

    // Profile Section
    document.getElementById('profile-username').textContent = currentUser.telegram_username;
    document.getElementById('profile-user-id').textContent = telegramUserId;
    document.getElementById('profile-profile-name').textContent = currentUser.telegram_profile_name;
    document.getElementById('profile-join-date').textContent = formatDate(currentUser.joined_at);
    document.getElementById('profile-current-balance').textContent = currentUser.current_balance_as;
    document.getElementById('profile-total-earned').textContent = currentUser.total_earned_as;
    document.getElementById('profile-total-tasks-done').textContent = currentUser.total_tasks_completed;
    document.getElementById('profile-current-streak-day').textContent = currentUser.streak_day;
    document.getElementById('profile-total-referrals').textContent = currentUser.referrals_count;

    // Update TG Task statuses
    updateTgTaskStatuses();

    // If on profile section and history is active, re-render
    if (currentActiveSection === 'profile-section') {
        const activeHistoryTab = document.querySelector('.history-view-card .tab-button.active');
        if (activeHistoryTab) {
            renderHistory(activeHistoryTab.dataset.historyType);
        } else {
            renderHistory('tasks'); // Default to tasks if no tab active
        }
    }
}

/**
 * Updates the daily check-in streak UI.
 */
function updateCheckinStreakUI() {
    const streakIndicator = document.getElementById('streak-indicator');
    streakIndicator.innerHTML = '';
    const currentDay = currentUser.streak_day;

    for (let i = 1; i <= 7; i++) {
        const capsule = document.createElement('div');
        capsule.classList.add('streak-day-capsule');
        capsule.textContent = `Day ${i}`;
        if (i <= currentDay) {
            capsule.classList.add('claimed');
        }
        if (i === currentDay) {
            capsule.classList.add('current-day');
        }
        streakIndicator.appendChild(capsule);
    }

    const claimButton = document.getElementById('claim-checkin-button');
    const checkinMessage = document.getElementById('checkin-message');
    const lastCheckinDate = currentUser.last_checkin_at ? currentUser.last_checkin_at.toDate() : null;
    const now = new Date();
    const nowUtcStartOfDay = startOfUtcDay(now);

    let canClaim = false;
    let nextClaimDay = (currentDay % 7) + 1;

    if (!lastCheckinDate) { // Never checked in
        canClaim = true;
    } else {
        const lastCheckinUtcStartOfDay = startOfUtcDay(lastCheckinDate);
        const tomorrowUtcStartOfDay = new Date(lastCheckinUtcStartOfDay);
        tomorrowUtcStartOfDay.setUTCDate(lastCheckinUtcStartOfDay.getUTCDate() + 1);

        if (nowUtcStartOfDay.getTime() === tomorrowUtcStartOfDay.getTime()) { // If current day is exactly the day after last check-in
            canClaim = true;
            checkinMessage.textContent = ''; // Clear message if it was about missed streak
        } else if (nowUtcStartOfDay.getTime() > tomorrowUtcStartOfDay.getTime()) { // Missed a day
            canClaim = true;
            nextClaimDay = 1; // Streak will reset
            checkinMessage.textContent = 'You missed a day! Streak will restart from Day 1.';
        } else { // Already checked in today
            checkinMessage.textContent = 'You have already claimed your reward for today.';
        }
    }

    if (canClaim) {
            // Check if user's last_checkin_at is exactly nowUtcStartOfDay - prevents double claim on same UTC day
            if (lastCheckinDate && startOfUtcDay(lastCheckinDate).getTime() === nowUtcStartOfDay.getTime()) {
                claimButton.disabled = true;
                claimButton.textContent = `Claimed Today`;
                claimButton.classList.remove('pulsing-button');
                checkinMessage.textContent = 'You have already claimed your reward for today.';
            } else {
                claimButton.disabled = false;
                claimButton.textContent = `Claim Day ${nextClaimDay}`;
                claimButton.classList.add('pulsing-button');
            }
    } else {
        claimButton.disabled = true;
        claimButton.textContent = `Claimed Today`;
        claimButton.classList.remove('pulsing-button');
    }
}

/**
 * Updates the "Today's Earnings" summary.
 */
async function updateTodayEarningsSummary() {
    const now = new Date();
    const startOfTodayUTC = startOfUtcDay(now);
    const startOfTodayTimestamp = firebase.firestore.Timestamp.fromDate(startOfTodayUTC);

    const tasksSnapshot = await db.collection('tasks')
        .where('user_id', '==', telegramUserId)
        .where('created_at', '>=', startOfTodayTimestamp)
        .where('status', '==', 'COMPLETED')
        .get();

    let todayAdsEarnings = 0;
    let todayTgTasksEarnings = 0;
    let todayReferralsEarnings = 0;

    tasksSnapshot.forEach(doc => {
        const task = doc.data();
        if (task.task_type === 'AD') {
            todayAdsEarnings += task.reward_points;
        } else if (task.task_type === 'TG_JOIN') {
            todayTgTasksEarnings += task.reward_points;
        } else if (task.task_type === 'REFERRAL_BONUS' && task.meta && task.meta.is_referrer_bonus) {
            todayReferralsEarnings += task.reward_points;
        }
    });

    document.getElementById('today-ads-earnings').textContent = `${todayAdsEarnings.toFixed(1)} AS`;
    document.getElementById('today-tg-tasks-earnings').textContent = `${todayTgTasksEarnings.toFixed(1)} AS`;
    document.getElementById('today-referrals-earnings').textContent = `${todayReferralsEarnings.toFixed(1)} AS`;
}


/**
 * Updates the status of Telegram Join tasks.
 */
async function updateTgTaskStatuses() {
    if (!currentUser) return;

    const tasks = await db.collection('tasks')
        .where('user_id', '==', telegramUserId)
        .where('task_type', '==', 'TG_JOIN')
        .where('status', '==', 'COMPLETED')
        .get();

    const completedTaskReferences = new Set();
    tasks.forEach(doc => {
        completedTaskReferences.add(doc.data().reference);
    });

    document.querySelectorAll('.task-item').forEach(item => {
        const taskLinkEl = item.querySelector('.task-link');
        const taskLink = taskLinkEl.href; // Use href as the unique reference
        const statusSpan = item.querySelector('.task-status');
        const checkButton = item.querySelector('.check-task-button');

        if (completedTaskReferences.has(taskLink)) {
            item.classList.add('completed');
            statusSpan.textContent = '✅';
            statusSpan.classList.add('completed-check');
            checkButton.disabled = true;
            checkButton.textContent = 'Completed';
            checkButton.classList.remove('pulsing-button');
        } else {
            item.classList.remove('completed');
            statusSpan.textContent = '';
            statusSpan.classList.remove('completed-check');
            checkButton.disabled = false;
            checkButton.textContent = 'Check';
            checkButton.classList.add('pulsing-button');
        }
    });
}

/**
 * Updates the list of referrals.
 */
async function updateReferralList() {
    const referralList = document.getElementById('referral-list');
    referralList.innerHTML = '';

    const referralsSnapshot = await db.collection('users')
        .where('referred_by', '==', telegramUserId)
        .get();

    if (referralsSnapshot.empty) {
        referralList.innerHTML = '<li class="history-item">No referrals yet. Share your code!</li>';
        return;
    }

    referralsSnapshot.forEach(doc => {
        const referredUser = doc.data();
        const listItem = document.createElement('li');
        listItem.classList.add('history-item');
        listItem.textContent = `@${referredUser.telegram_username || referredUser.telegram_profile_name} (ID: ${doc.id})`;
        referralList.appendChild(listItem);
    });
}

/**
 * Checks and updates the state of withdrawal buttons based on current balance.
 */
function checkWithdrawalButtonsState() {
    const currentBalance = currentUser.current_balance_as;
    const binanceButton = document.getElementById('withdraw-binance-button');
    const googlePlayButton = document.getElementById('withdraw-google-play-button');

    // Binance threshold
    if (currentBalance >= 1320) {
        binanceButton.disabled = false;
        binanceButton.classList.add('pulsing-button');
    } else {
        binanceButton.disabled = true;
        binanceButton.classList.remove('pulsing-button');
    }

    // Google Play threshold
    if (currentBalance >= 710) {
        googlePlayButton.disabled = false;
        googlePlayButton.classList.add('pulsing-button');
    } else {
        googlePlayButton.disabled = true;
        googlePlayButton.classList.remove('pulsing-button');
    }
}

/**
 * Updates the withdrawal history list.
 */
async function updateWithdrawalHistory() {
    const withdrawalHistoryList = document.getElementById('withdrawal-history-list');
    withdrawalHistoryList.innerHTML = '';

    const withdrawalsSnapshot = await db.collection('withdrawals')
        .where('user_id', '==', telegramUserId)
        .orderBy('created_at', 'desc')
        .get();

    if (withdrawalsSnapshot.empty) {
        withdrawalHistoryList.innerHTML = '<li class="history-item pending">No withdrawals yet.</li>';
        return;
    }

    withdrawalsSnapshot.forEach(doc => {
        const withdrawal = doc.data();
        const listItem = document.createElement('li');
        listItem.classList.add('history-item', withdrawal.status.toLowerCase());
        listItem.innerHTML = `
            <div><strong>${withdrawal.method === 'BINANCE' ? 'Binance Pay' : 'Google Play'}</strong> - ${withdrawal.amount_as_points} AS</div>
            <div>Status: ${withdrawal.status} ${withdrawal.status === 'PENDING' ? '🔴' : withdrawal.status === 'SUCCESSFUL' ? '✅' : '❌'}</div>
            <div>Recipient: ${withdrawal.recipient}</div>
            <div>Requested: ${formatDateTime(withdrawal.created_at)}</div>
            ${withdrawal.updated_at ? `<div>Last Update: ${formatDateTime(withdrawal.updated_at)}</div>` : ''}
            ${withdrawal.admin_note ? `<div>Admin Note: ${withdrawal.admin_note}</div>` : ''}
        `;
        withdrawalHistoryList.appendChild(listItem);
    });
}

/**
 * Renders the task or withdrawal history in the profile section.
 * @param {'tasks'|'withdrawals'} type
 */
async function renderHistory(type) {
    const historyList = document.getElementById('activity-history-list');
    historyList.innerHTML = '';

    if (type === 'tasks') {
        const tasksSnapshot = await db.collection('tasks')
            .where('user_id', '==', telegramUserId)
            .orderBy('created_at', 'desc')
            .get();

        if (tasksSnapshot.empty) {
            historyList.innerHTML = '<li class="history-item">No tasks completed yet.</li>';
            return;
        }

        tasksSnapshot.forEach(doc => {
            const task = doc.data();
            const listItem = document.createElement('li');
            listItem.classList.add('history-item', task.status.toLowerCase());
            listItem.innerHTML = `
                <div><strong>${task.task_type.replace(/_/g, ' ')}</strong> - +${task.reward_points} AS</div>
                <div>Status: ${task.status}</div>
                <div>Details: ${task.reference || 'N/A'}</div>
                <div>Time: ${formatDateTime(task.created_at)}</div>
            `;
            historyList.appendChild(listItem);
        });
    } else if (type === 'withdrawals') {
        const withdrawalsSnapshot = await db.collection('withdrawals')
            .where('user_id', '==', telegramUserId)
            .orderBy('created_at', 'desc')
            .get();

        if (withdrawalsSnapshot.empty) {
            historyList.innerHTML = '<li class="history-item">No withdrawals yet.</li>';
            return;
        }

        withdrawalsSnapshot.forEach(doc => {
            const withdrawal = doc.data();
            const listItem = document.createElement('li');
            listItem.classList.add('history-item', withdrawal.status.toLowerCase());
            listItem.innerHTML = `
                <div><strong>${withdrawal.method === 'BINANCE' ? 'Binance Pay' : 'Google Play'}</strong> - ${withdrawal.amount_as_points} AS</div>
                <div>Status: ${withdrawal.status} ${withdrawal.status === 'PENDING' ? '🔴' : withdrawal.status === 'SUCCESSFUL' ? '✅' : '❌'}</div>
                <div>Recipient: ${withdrawal.recipient}</div>
                <div>Requested: ${formatDateTime(withdrawal.created_at)}</div>
            `;
            historyList.appendChild(listItem);
        });
    }
}


// --- Event Handlers ---

/**
 * Handles daily check-in claim.
 */
document.getElementById('claim-checkin-button').addEventListener('click', async () => {
    if (!currentUser || document.getElementById('claim-checkin-button').disabled) return;

    try {
        const userRef = db.collection('users').doc(telegramUserId);
        const now = new Date();
        const nowUtcStartOfDay = startOfUtcDay(now);

        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("User does not exist!");
            const data = userDoc.data();

            const lastCheckinDate = data.last_checkin_at ? data.last_checkin_at.toDate() : null;
            let newStreakDay = data.streak_day || 0;
            let reward = 0;

            const checkinRewards = [1, 2, 4, 6, 10, 15, 20]; // Day 1 to Day 7

            if (lastCheckinDate && startOfUtcDay(lastCheckinDate).getTime() === nowUtcStartOfDay.getTime()) {
                 throw new Error('You have already claimed your daily check-in reward today.');
            }

            if (!lastCheckinDate) {
                // First check-in ever
                newStreakDay = 1;
                reward = checkinRewards[0];
            } else {
                const lastCheckinUtcStartOfDay = startOfUtcDay(lastCheckinDate);
                const tomorrowUtcStartOfDay = new Date(lastCheckinUtcStartOfDay);
                tomorrowUtcStartOfDay.setUTCDate(lastCheckinUtcStartOfDay.getUTCDate() + 1);

                if (nowUtcStartOfDay.getTime() === tomorrowUtcStartOfDay.getTime()) {
                    // Consecutive day
                    newStreakDay = (newStreakDay % 7) + 1;
                    reward = checkinRewards[newStreakDay - 1];
                } else if (nowUtcStartOfDay.getTime() > tomorrowUtcStartOfDay.getTime()) {
                    // Missed a day, reset streak
                    newStreakDay = 1;
                    reward = checkinRewards[0];
                } else {
                    // This else block should ideally not be reached if the first check passes.
                    throw new Error('You have already claimed your daily check-in reward today.');
                }
            }

            // Update user document
            transaction.update(userRef, {
                current_balance_as: firebase.firestore.FieldValue.increment(reward),
                total_earned_as: firebase.firestore.FieldValue.increment(reward),
                streak_day: newStreakDay,
                last_checkin_at: firebase.firestore.FieldValue.serverTimestamp(),
                total_tasks_completed: firebase.firestore.FieldValue.increment(1),
                total_checkins_completed: firebase.firestore.FieldValue.increment(1)
            });

            // Log task within the transaction
            const newTaskRef = db.collection('tasks').doc();
            transaction.set(newTaskRef, {
                user_id: telegramUserId,
                task_type: 'CHECKIN',
                reference: `Day ${newStreakDay}`,
                reward_points: reward,
                status: 'COMPLETED',
                created_at: firebase.firestore.FieldValue.serverTimestamp(),
                meta: {
                    previous_streak: data.streak_day
                }
            });

            // Update currentUser locally for immediate UI
            currentUser.current_balance_as += reward;
            currentUser.total_earned_as += reward;
            currentUser.streak_day = newStreakDay;
            currentUser.last_checkin_at = firebase.firestore.Timestamp.fromDate(new Date());
            currentUser.total_tasks_completed += 1;
            currentUser.total_checkins_completed = (currentUser.total_checkins_completed || 0) + 1;
        });

        showToast(`+${reward} AS for Day ${currentUser.streak_day} Check-in!`, 'success');
        updateUI(); // Re-render UI after transaction

    } catch (error) {
        console.error('Error claiming daily check-in:', error);
        showToast(error.message || 'Failed to claim check-in.', 'error');
    }
});

/**
 * Handles starting an ADS task (Monetag).
 */
document.getElementById('start-ads-task-button').addEventListener('click', async () => {
    if (!currentUser) {
        showToast('Please wait, user data is loading.', 'info');
        return;
    }

    const startButton = document.getElementById('start-ads-task-button');
    startButton.disabled = true; // Disable immediately to prevent double-clicks
    startButton.classList.remove('pulsing-button');

    try {
        const userRef = db.collection('users').doc(telegramUserId);
        const now = new Date();
        const nowUtcStartOfHour = startOfUtcHour(now);
        const nowUtcStartOfDay = startOfUtcDay(now);

        // Fetch user data once to check current counts before transaction
        const userDocSnapshot = await userRef.get();
        if (!userDocSnapshot.exists) throw new Error("User does not exist!");
        const currentData = userDocSnapshot.data();

        let dailyAdsCount = currentData.ads_daily_count || 0;
        let hourlyAdsCount = currentData.ads_hourly_count || 0;
        const lastDailyReset = currentData.ads_last_daily_reset ? currentData.ads_last_daily_reset.toDate() : new Date(0);
        const lastHourlyReset = currentData.ads_last_hourly_reset ? currentData.ads_last_hourly_reset.toDate() : new Date(0);

        // Client-side pre-check for rate limits for immediate feedback
        let adsRateLimitMessage = '';
        let shouldResetDaily = startOfUtcDay(lastDailyReset).getTime() < nowUtcStartOfDay.getTime();
        let shouldResetHourly = startOfUtcHour(lastHourlyReset).getTime() < nowUtcStartOfHour.getTime();

        if (shouldResetDaily) dailyAdsCount = 0;
        if (shouldResetHourly) hourlyAdsCount = 0;

        if (dailyAdsCount >= 200) {
            adsRateLimitMessage = 'Daily ads limit reached (200 ads). Try again tomorrow!';
            showToast(adsRateLimitMessage, 'error');
            document.getElementById('ads-rate-limit-message').textContent = adsRateLimitMessage;
            return;
        }
        if (hourlyAdsCount >= 25) {
            adsRateLimitMessage = 'Hourly ads limit reached (25 ads). Try again in the next hour!';
            showToast(adsRateLimitMessage, 'error');
            document.getElementById('ads-rate-limit-message').textContent = adsRateLimitMessage;
            return;
        }
        document.getElementById('ads-rate-limit-message').textContent = ''; // Clear previous message if limits are fine

        // Proceed with Monetag ad
        showToast('Loading ad...', 'info');

        const adRewardPoints = 0.3; // 0.3 AS point per ad
        let adCompleted = false;

        if (typeof show_9725833 === 'function') {
            adCompleted = await new Promise(resolve => {
                show_9725833().then(() => {
                    resolve(true); // Ad shown and closed by user
                }).catch(err => {
                    console.error("Monetag ad failed or was skipped:", err);
                    resolve(false); // Ad not completed
                });
            });
        } else {
            console.error("Monetag SDK function show_9725833 is not defined. Ensure SDK loaded correctly.");
            throw new Error("Ad service not ready. Please try again later.");
        }

        if (!adCompleted) {
            throw new Error('Ad was not completed or an error occurred.');
        }

        // If ad is completed, then run the transaction to update counts and balance
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("User does not exist!");
            const data = userDoc.data();

            let txDailyAdsCount = data.ads_daily_count || 0;
            let txHourlyAdsCount = data.ads_hourly_count || 0;
            const txLastDailyReset = data.ads_last_daily_reset ? data.ads_last_daily_reset.toDate() : new Date(0);
            const txLastHourlyReset = data.ads_last_hourly_reset ? data.ads_last_hourly_reset.toDate() : new Date(0);

            let updatedFields = {};

            // Re-check and reset daily/hourly counts within transaction for data consistency
            if (startOfUtcDay(txLastDailyReset).getTime() < nowUtcStartOfDay.getTime()) {
                txDailyAdsCount = 0;
                updatedFields.ads_last_daily_reset = firebase.firestore.FieldValue.serverTimestamp();
            }
            if (startOfUtcHour(txLastHourlyReset).getTime() < nowUtcStartOfHour.getTime()) {
                txHourlyAdsCount = 0;
                updatedFields.ads_last_hourly_reset = firebase.firestore.FieldValue.serverTimestamp();
            }

            if (txDailyAdsCount >= 200 || txHourlyAdsCount >= 25) {
                // This scenario means another ad was completed right before this transaction committed
                // Re-throw to abort and prevent over-crediting
                throw new Error('Ad limits were exceeded during processing. Please try again later.');
            }

            updatedFields.ads_daily_count = firebase.firestore.FieldValue.increment(1);
            updatedFields.ads_hourly_count = firebase.firestore.FieldValue.increment(1);
            updatedFields.current_balance_as = firebase.firestore.FieldValue.increment(adRewardPoints);
            updatedFields.total_earned_as = firebase.firestore.FieldValue.increment(adRewardPoints);
            updatedFields.total_tasks_completed = firebase.firestore.FieldValue.increment(1);
            updatedFields.total_tasks_completed_ads = firebase.firestore.FieldValue.increment(1);

            transaction.update(userRef, updatedFields);

            // Log task completion within the transaction
            const newTaskRef = db.collection('tasks').doc();
            transaction.set(newTaskRef, {
                user_id: telegramUserId,
                task_type: 'AD',
                reference: `Monetag Ad - ${Date.now()}`, // Unique ID for each ad completion
                reward_points: adRewardPoints,
                status: 'COMPLETED',
                created_at: firebase.firestore.FieldValue.serverTimestamp(),
                meta: {
                    ad_id: 'monetag_ad_placeholder',
                    daily_count_after: txDailyAdsCount + 1,
                    hourly_count_after: txHourlyAdsCount + 1
                }
            });
            
            // Update currentUser locally for immediate UI update
            currentUser.current_balance_as += adRewardPoints;
            currentUser.total_earned_as += adRewardPoints;
            currentUser.total_tasks_completed += 1;
            currentUser.total_tasks_completed_ads = (currentUser.total_tasks_completed_ads || 0) + 1;
            currentUser.ads_daily_count = (shouldResetDaily ? 0 : dailyAdsCount) + 1;
            currentUser.ads_hourly_count = (shouldResetHourly ? 0 : hourlyAdsCount) + 1;
            if (updatedFields.ads_last_daily_reset) currentUser.ads_last_daily_reset = firebase.firestore.Timestamp.fromDate(new Date());
            if (updatedFields.ads_last_hourly_reset) currentUser.ads_last_hourly_reset = firebase.firestore.Timestamp.fromDate(new Date());

            showToast(`+${adRewardPoints} AS for watching an ad!`, 'success');
        });

        updateUI(); // Re-render UI after successful transaction

    } catch (error) {
        console.error('Error starting ADS task:', error);
        showToast(error.message || 'Failed to start ADS task.', 'error');
    } finally {
        startButton.disabled = false;
        startButton.classList.add('pulsing-button');
    }
});


/**
 * Handles clicking a "Check" button for Telegram tasks.
 */
document.querySelectorAll('.check-task-button').forEach(button => {
    button.addEventListener('click', async (event) => {
        if (!currentUser) return;

        const clickedButton = event.currentTarget;
        const taskLink = clickedButton.dataset.channelLink; // Use data-channel-link
        const rewardPoints = 1; // 1 AS point per TG task

        clickedButton.disabled = true;
        clickedButton.textContent = 'Checking...';
        clickedButton.classList.remove('pulsing-button');

        try {
            // Check if already completed
            const existingTask = await db.collection('tasks')
                .where('user_id', '==', telegramUserId)
                .where('task_type', '==', 'TG_JOIN')
                .where('reference', '==', taskLink)
                .where('status', '==', 'COMPLETED')
                .get();

            if (!existingTask.empty) {
                showToast('Task already completed!', 'info');
                return; // Exit, status will be updated by updateTgTaskStatuses in finally block
            }

            // Simulate Telegram membership check (requires backend bot for real verification)
            const isMember = await checkTelegramMembership(telegramUserId, taskLink);

            if (isMember) {
                await db.runTransaction(async (transaction) => {
                    const userRef = db.collection('users').doc(telegramUserId);
                    const userDoc = await transaction.get(userRef);
                    if (!userDoc.exists) throw new Error("User does not exist!");
                    const data = userDoc.data();

                    // Update user balance and total tasks
                    transaction.update(userRef, {
                        current_balance_as: firebase.firestore.FieldValue.increment(rewardPoints),
                        total_earned_as: firebase.firestore.FieldValue.increment(rewardPoints),
                        total_tasks_completed: firebase.firestore.FieldValue.increment(1),
                        total_tasks_completed_tg: firebase.firestore.FieldValue.increment(1) // Increment TG specific counter
                    });

                    // Log task completion within the transaction
                    const newTaskRef = db.collection('tasks').doc();
                    transaction.set(newTaskRef, {
                        user_id: telegramUserId,
                        task_type: 'TG_JOIN',
                        reference: taskLink,
                        reward_points: rewardPoints,
                        status: 'COMPLETED',
                        created_at: firebase.firestore.FieldValue.serverTimestamp(),
                        meta: { channel_link: taskLink }
                    });

                    // Update currentUser locally
                    currentUser.current_balance_as += rewardPoints;
                    currentUser.total_earned_as += rewardPoints;
                    currentUser.total_tasks_completed += 1;
                    currentUser.total_tasks_completed_tg = (currentUser.total_tasks_completed_tg || 0) + 1;
                });

                showToast(`+${rewardPoints} AS for joining!`, 'success');
                updateUI();
            } else {
                showToast('You must join the channel/group first!', 'error');
            }
        } catch (error) {
            console.error('Error completing TG task:', error);
            showToast(error.message || 'Failed to complete Telegram task.', 'error');
        } finally {
            updateTgTaskStatuses(); // Ensure button states and checkmarks are correct
        }
    });
});

/**
 * Handles copying referral code.
 */
document.getElementById('copy-referral-code-button').addEventListener('click', () => {
    const referralCodeField = document.getElementById('referral-code-field');
    referralCodeField.select();
    referralCodeField.setSelectionRange(0, 99999); // For mobile devices
    document.execCommand('copy');

    const copyButton = document.getElementById('copy-referral-code-button');
    const originalText = copyButton.textContent;
    copyButton.textContent = '✓ Copied!';
    referralCodeField.style.boxShadow = '0 0 15px var(--secondary-color)'; // Glow effect

    setTimeout(() => {
        copyButton.textContent = originalText;
        referralCodeField.style.boxShadow = '';
    }, 2000);
    showToast('Referral code copied!', 'info');
});

/**
 * Handles submitting a referral code.
 */
document.getElementById('submit-referral-code-button').addEventListener('click', async () => {
    if (!currentUser) return;
    if (currentUser.referred_by || currentUser.referral_entry_completed) {
        showToast('You have already used a referral code.', 'info');
        return;
    }

    const referralCodeInput = document.getElementById('enter-referral-code-input');
    const enteredCode = referralCodeInput.value.trim();
    const referralEntryMessage = document.getElementById('referral-entry-message');

    if (!enteredCode) {
        referralEntryMessage.textContent = 'Please enter a referral code.';
        showToast('Please enter a referral code.', 'error');
        return;
    }

    if (enteredCode === currentUser.referral_code) {
        referralEntryMessage.textContent = 'You cannot refer yourself!';
        showToast('Self-referral is not allowed.', 'error');
        return;
    }

    try {
        const referrerUsers = await db.collection('users')
            .where('referral_code', '==', enteredCode)
            .limit(1)
            .get();

        if (referrerUsers.empty) {
            referralEntryMessage.textContent = 'Invalid referral code.';
            showToast('Invalid referral code.', 'error');
            return;
        }

        const referrerDoc = referrerUsers.docs[0];
        const referrerId = referrerDoc.id;
        const referrerData = referrerDoc.data();

        await db.runTransaction(async (transaction) => {
            const userRef = db.collection('users').doc(telegramUserId);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("User does not exist!");
            const data = userDoc.data();

            if (data.referred_by || data.referral_entry_completed) {
                throw new Error('You have already used a referral code.');
            }

            // Grant 2 points to the referred user (current user)
            const referredUserBonus = 2;
            transaction.update(userRef, {
                referred_by: referrerId,
                referral_entry_completed: true,
                current_balance_as: firebase.firestore.FieldValue.increment(referredUserBonus),
                total_earned_as: firebase.firestore.FieldValue.increment(referredUserBonus)
            });

            // Log bonus for referred user within the transaction
            const referredUserTaskRef = db.collection('tasks').doc();
            transaction.set(referredUserTaskRef, {
                user_id: telegramUserId,
                task_type: 'REFERRAL_BONUS',
                reference: `Referred by ${referrerId}`,
                reward_points: referredUserBonus,
                status: 'COMPLETED',
                created_at: firebase.firestore.FieldValue.serverTimestamp(),
                meta: {
                    is_referrer_bonus: false,
                    referrer_id: referrerId
                }
            });

            // Update current user's local cache
            currentUser.referred_by = referrerId;
            currentUser.referral_entry_completed = true;
            currentUser.current_balance_as += referredUserBonus;
            currentUser.total_earned_as += referredUserBonus;


            // Check if referrer is eligible for bonus (if referred user completes onboarding tasks)
            // This part is ideal for a Cloud Function to run in the background after the referred user completes tasks.
            // For a client-side only app, we'll check immediately, but be aware of limitations.
            const hasCompletedOnboarding = await checkOnboardingTasksCompleted(telegramUserId); // This is an async call outside current transaction, but ok for read.

            if (hasCompletedOnboarding && !data.referred_bonus_given) { // Ensure referrer hasn't been credited yet for this specific referral
                const referrerUserRef = db.collection('users').doc(referrerId);
                const referrerUserDoc = await transaction.get(referrerUserRef);
                if (!referrerUserDoc.exists) throw new Error("Referrer user does not exist!");
                const currentReferrerData = referrerUserDoc.data();

                const referrerBonus = 5;
                transaction.update(referrerUserRef, {
                    current_balance_as: firebase.firestore.FieldValue.increment(referrerBonus),
                    total_earned_as: firebase.firestore.FieldValue.increment(referrerBonus),
                    referrals_count: firebase.firestore.FieldValue.increment(1)
                });

                // Mark that referrer bonus has been given for this referral (on the referred user's document)
                // This flag on the referred user's doc ensures referrer bonus is one-time per referral
                transaction.update(userRef, {
                    referred_bonus_given: true
                });

                // Log bonus for referrer within the transaction
                const referrerTaskRef = db.collection('tasks').doc();
                transaction.set(referrerTaskRef, {
                    user_id: referrerId,
                    task_type: 'REFERRAL_BONUS',
                    reference: `Referred user ${telegramUserId}`,
                    reward_points: referrerBonus,
                    status: 'COMPLETED',
                    created_at: firebase.firestore.FieldValue.serverTimestamp(),
                    meta: {
                        is_referrer_bonus: true,
                        referred_user_id: telegramUserId
                    }
                });

                showToast(`Referral bonus (${referrerBonus} AS) credited to @${referrerData.telegram_username}!`, 'success');
            } else if (!hasCompletedOnboarding) {
                 showToast('Referrer will be credited after you complete onboarding tasks (e.g., all TG joins or 50 ads).', 'info', 7000);
            }
        });

        showToast(`Referral code applied! You received ${referredUserBonus} AS points.`, 'success');
        referralCodeInput.value = '';
        updateUI();

    } catch (error) {
        console.error('Error submitting referral code:', error);
        referralEntryMessage.textContent = error.message;
        showToast(error.message || 'Failed to submit referral code.', 'error');
    }
});

/**
 * Handles withdrawal request for Binance Pay ID.
 */
document.getElementById('withdraw-binance-button').addEventListener('click', async () => {
    if (!currentUser || document.getElementById('withdraw-binance-button').disabled) return;

    const binanceIdInput = document.getElementById('binance-pay-id-input');
    const binancePayId = binanceIdInput.value.trim();
    const withdrawAmount = 1320;
    const estUsdValue = 0.9;

    if (!binancePayId) {
        showToast('Please enter your Binance Pay ID.', 'error');
        return;
    }
    // Basic validation: Binance Pay ID is typically 10-20 alphanumeric characters
    if (!/^[a-zA-Z0-9]{10,20}$/.test(binancePayId)) {
        showToast('Invalid Binance Pay ID format. (e.g., 10-20 alphanumeric chars)', 'error');
        return;
    }

    if (currentUser.current_balance_as < withdrawAmount) {
        showToast('Insufficient AS Points for Binance withdrawal.', 'error');
        return;
    }

    const confirmWithdraw = confirm(`Withdraw ${withdrawAmount} AS Points ($${estUsdValue}) to Binance Pay ID: ${binancePayId}?`);
    if (!confirmWithdraw) return;

    try {
        await db.runTransaction(async (transaction) => {
            const userRef = db.collection('users').doc(telegramUserId);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("User does not exist!");
            const data = userDoc.data();

            if (data.current_balance_as < withdrawAmount) {
                throw new Error('Insufficient AS Points.');
            }

            // Deduct points
            transaction.update(userRef, {
                current_balance_as: firebase.firestore.FieldValue.increment(-withdrawAmount)
            });

            // Create withdrawal record within the transaction
            const withdrawalRef = db.collection('withdrawals').doc(); // Auto-generate ID
            transaction.set(withdrawalRef, {
                user_id: telegramUserId,
                telegram_username: currentUser.telegram_username,
                telegram_profile_name: currentUser.telegram_profile_name,
                method: 'BINANCE',
                amount_as_points: withdrawAmount,
                est_usd_value: estUsdValue,
                recipient: binancePayId,
                status: 'PENDING',
                created_at: firebase.firestore.FieldValue.serverTimestamp(),
                updated_at: firebase.firestore.FieldValue.serverTimestamp(),
                admin_note: ''
            });

            currentUser.current_balance_as -= withdrawAmount;
        });

        showToast('Binance withdrawal request submitted successfully! Pending review.', 'success', 5000);
        binanceIdInput.value = ''; // Clear input
        updateUI();

        // --- Simulate Bot Notification (requires a real bot backend) ---
        const notificationMessage = `💸 NEW WITHDRAWAL REQUEST RECEIVED! 💸

👤 Name: ${telegramProfileName}
🔗 Username: @${telegramUsername}
🆔 User ID: ${telegramUserId}
💰 AS Points: ${withdrawAmount}
💳 Payment Method: Binance Pay ID
⏳ Status: 🔴 Pending (Under Review)
🕒 Request Time: ${new Date().toLocaleString('en-US', { timeZone: 'UTC', hour12: false })} UTC

⚡ Our team will review this request shortly. Once verified, the status will be updated to ✅ Successful or ❌ Rejected. Stay tuned!`;

        // In a real application, you would send this to your bot's API endpoint:
        // Example: await fetch('/api/sendWithdrawalNotification', { method: 'POST', body: JSON.stringify({ message: notificationMessage, channelId: TELEGRAM_CHANNEL_FOR_WITHDRAWALS }) });
        console.log(`[Bot Simulation]: Withdrawal notification to channel ${TELEGRAM_CHANNEL_FOR_WITHDRAWALS}:\n${notificationMessage}`);
        // --- End Bot Simulation ---

    } catch (error) {
        console.error('Error with Binance withdrawal:', error);
        showToast(error.message || 'Failed to submit Binance withdrawal request.', 'error');
    }
});

/**
 * Handles withdrawal request for Google Play Redeem Code.
 */
document.getElementById('withdraw-google-play-button').addEventListener('click', async () => {
    if (!currentUser || document.getElementById('withdraw-google-play-button').disabled) return;

    const emailInput = document.getElementById('google-play-email-input');
    const email = emailInput.value.trim();
    const withdrawAmount = 710;
    const estUsdValue = 0.5;

    if (!email) {
        showToast('Please enter your email address.', 'error');
        return;
    }
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('Invalid email address format.', 'error');
        return;
    }

    if (currentUser.current_balance_as < withdrawAmount) {
        showToast('Insufficient AS Points for Google Play withdrawal.', 'error');
        return;
    }

    const confirmWithdraw = confirm(`Withdraw ${withdrawAmount} AS Points ($${estUsdValue}) to Email: ${email}?`);
    if (!confirmWithdraw) return;

    try {
        await db.runTransaction(async (transaction) => {
            const userRef = db.collection('users').doc(telegramUserId);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("User does not exist!");
            const data = userDoc.data();

            if (data.current_balance_as < withdrawAmount) {
                throw new Error('Insufficient AS Points.');
            }

            // Deduct points
            transaction.update(userRef, {
                current_balance_as: firebase.firestore.FieldValue.increment(-withdrawAmount)
            });

            // Create withdrawal record within the transaction
            const withdrawalRef = db.collection('withdrawals').doc(); // Auto-generate ID
            transaction.set(withdrawalRef, {
                user_id: telegramUserId,
                telegram_username: currentUser.telegram_username,
                telegram_profile_name: currentUser.telegram_profile_name,
                method: 'GOOGLE_PLAY',
                amount_as_points: withdrawAmount,
                est_usd_value: estUsdValue,
                recipient: email,
                status: 'PENDING',
                created_at: firebase.firestore.FieldValue.serverTimestamp(),
                updated_at: firebase.firestore.FieldValue.serverTimestamp(),
                admin_note: ''
            });

            currentUser.current_balance_as -= withdrawAmount;
        });

        showToast('Google Play withdrawal request submitted successfully! Code will be sent to your email after review.', 'success', 5000);
        emailInput.value = ''; // Clear input
        updateUI();

        // --- Simulate Bot Notification (requires a real bot backend) ---
        const notificationMessage = `💸 NEW WITHDRAWAL REQUEST RECEIVED! 💸

👤 Name: ${telegramProfileName}
🔗 Username: @${telegramUsername}
🆔 User ID: ${telegramUserId}
💰 AS Points: ${withdrawAmount}
💳 Payment Method: Google Play Redeem Code
⏳ Status: 🔴 Pending (Under Review)
🕒 Request Time: ${new Date().toLocaleString('en-US', { timeZone: 'UTC', hour12: false })} UTC

⚡ Our team will review this request shortly. Once verified, the status will be updated to ✅ Successful or ❌ Rejected. Stay tuned!`;

        // In a real application, you would send this to your bot's API endpoint:
        // Example: await fetch('/api/sendWithdrawalNotification', { method: 'POST', body: JSON.stringify({ message: notificationMessage, channelId: TELEGRAM_CHANNEL_FOR_WITHDRAWALS }) });
        console.log(`[Bot Simulation]: Withdrawal notification to channel ${TELEGRAM_CHANNEL_FOR_WITHDRAWALS}:\n${notificationMessage}`);
        // --- End Bot Simulation ---

    } catch (error) {
        console.error('Error with Google Play withdrawal:', error);
        showToast(error.message || 'Failed to submit Google Play withdrawal request.', 'error');
    }
});

// --- Navigation and Section Management ---
function showSection(sectionId) {
    document.querySelectorAll('.app-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');
    currentActiveSection = sectionId; // Update global state
    Telegram.WebApp.ready(); // Inform Telegram that app is ready for new section height

    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.target === sectionId) {
            item.classList.add('active');
            updateNavIndicator(item);
        }
    });

    // Special logic for profile section to re-render history on tab change
    if (sectionId === 'profile-section') {
        const defaultTabButton = document.querySelector('.history-view-card .tab-button.active') || document.querySelector('.history-view-card .tab-button[data-history-type="tasks"]');
        if (defaultTabButton) {
            defaultTabButton.click(); // Simulate click to render history
        } else {
            renderHistory('tasks'); // Fallback to tasks
        }
    } else if (sectionId === 'withdraw-section') {
        updateWithdrawalHistory();
    }
}

document.querySelectorAll('.bottom-navigation .nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const targetSectionId = item.dataset.target;
        showSection(targetSectionId);
    });
});

document.querySelectorAll('.history-view-card .tab-button').forEach(button => {
    button.addEventListener('click', (event) => {
        document.querySelectorAll('.history-view-card .tab-button').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        renderHistory(event.target.dataset.historyType);
    });
});


/**
 * Updates the position and width of the active navigation indicator.
 * @param {HTMLElement} activeNavItem The currently active navigation item.
 */
function updateNavIndicator(activeNavItem) {
    const indicator = document.querySelector('.active-nav-indicator');
    if (!activeNavItem || !indicator) return;

    const navItems = Array.from(document.querySelectorAll('.nav-item'));
    const itemIndex = navItems.indexOf(activeNavItem);
    if (itemIndex === -1) return;

    // Get the computed style for consistent calculations
    const navItemStyle = window.getComputedStyle(activeNavItem);
    const navWidth = parseFloat(navItemStyle.width); // Use computed width
    const navLeft = activeNavItem.offsetLeft;

    indicator.style.width = `${navWidth}px`;
    indicator.style.transform = `translateX(${navLeft}px)`;
}

// --- Initialization ---

/**
 * Initializes the Telegram Web App and loads user data.
 */
async function initializeWebApp() {
    if (Telegram.WebApp) {
        Telegram.WebApp.ready();
        Telegram.WebApp.expand();
        // Telegram.WebApp.setHeaderColor('#7f00ff'); // Set header color to primary-color

        const initData = Telegram.WebApp.initData || '';
        const user = Telegram.WebApp.initDataUnsafe.user;

        // For local testing without Telegram.WebApp
        if (!user && !Telegram.WebApp.initDataUnsafe.query_id) {
             console.warn("Running outside Telegram.WebApp. Using dummy data.");
             telegramUserId = 'DUMMY_USER_12345';
             telegramUsername = 'dummyuser';
             telegramProfileName = 'Dummy User';
             document.getElementById('closeWebAppButton').style.display = 'block'; // Show close button for testing
        } else if (user) {
            // Validate initData with your backend for security in a production app.
            // For this client-side demo, we proceed directly.
            // console.log("Telegram initData:", initData);
            telegramUserId = user.id.toString();
            telegramUsername = user.username || `id${user.id}`;
            telegramProfileName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || `User ${user.id}`;
        } else {
            // Fallback if user object is not directly available but initData exists
             console.warn("Telegram user data not directly available, but initData exists. Attempting to parse.");
             try {
                // This regex attempts to find the 'user' field in initData and parse it.
                // It's a heuristic and might not cover all Telegram initData formats.
                const userRegex = /"user":"([^"]+)"/;
                const match = initData.match(userRegex);
                if (match && match[1]) {
                    // Telegram initData can escape quotes within the user JSON, so we unescape them.
                    const decodedUser = decodeURIComponent(match[1].replace(/\\"/g, '"'));
                    const userData = JSON.parse(decodedUser);
                    telegramUserId = userData.id.toString();
                    telegramUsername = userData.username || `id${userData.id}`;
                    telegramProfileName = `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || `User ${userData.id}`;
                } else {
                     throw new Error('User data not found in initData.');
                }
             } catch (parseError) {
                 console.error("Failed to parse user data from initData:", parseError);
                 telegramUserId = 'UNKNOWN_ID';
                 telegramUsername = 'N/A';
                 telegramProfileName = 'Unknown User';
                 showToast('Failed to get Telegram user ID from initData. Please open from bot.', 'error', 0);
                 return;
             }
        }
    } else {
        console.warn("Telegram WebApp SDK not loaded. Using dummy data.");
        telegramUserId = 'DUMMY_USER_12345';
        telegramUsername = 'dummyuser';
        telegramProfileName = 'Dummy User';
        document.getElementById('closeWebAppButton').style.display = 'block'; // Show close button for testing
    }

    if (!telegramUserId || telegramUserId === 'UNKNOWN_ID') {
        showToast('Failed to get Telegram user ID. Please open from bot.', 'error', 0); // Permanent error
        return;
    }

    try {
        currentUser = await getOrCreateUser(telegramUserId, telegramUsername, telegramProfileName);
        console.log('Current User:', currentUser);
        updateUI();
        showSection('home-section'); // Show home section by default
        Telegram.WebApp.ready(); // Ensure Telegram knows the app is ready and height is set
        document.querySelector('.nav-item[data-target="home-section"]').classList.add('active'); // Initial nav highlight
        updateNavIndicator(document.querySelector('.nav-item[data-target="home-section"]'));

    } catch (error) {
        console.error('Failed to initialize user data:', error);
        showToast('Failed to load user data. Please try again.', 'error', 0);
    }
}

// Ensure Monetag SDK is loaded before trying to use show_9725833
window.addEventListener('load', () => {
    // Check if the Monetag function is available after a short delay
    setTimeout(() => {
        if (typeof show_9725833 === 'function') {
            monetagSdkLoaded = true;
            console.log('Monetag SDK loaded successfully.');
        } else {
            console.warn('Monetag SDK function show_9725833 is not found.');
        }
    }, 2000); // Give Monetag a moment to load
});


// Call initialization function
document.addEventListener('DOMContentLoaded', initializeWebApp);

// For local testing: if running outside Telegram, allow closing the simulated webapp.
document.getElementById('closeWebAppButton').addEventListener('click', () => {
    if (Telegram.WebApp && Telegram.WebApp.close) {
        Telegram.WebApp.close();
    } else {
        alert('Simulating WebApp close. (In a real scenario, Telegram.WebApp.close() would be called)');
        window.close(); // Close the browser tab/window
    }
});

// Initial indicator position on load
window.addEventListener('resize', () => {
    const activeNavItem = document.querySelector('.nav-item.active');
    if (activeNavItem) {
        updateNavIndicator(activeNavItem);
    }
});