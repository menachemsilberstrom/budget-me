// Application State
const state = {
    supabase: null,
    isConnected: false,
    cycleDay: 10,
    currentPeriodKey: '',
    categories: [],
    budgets: [],
    transactions: [],
    chartInstance: null
};

// Default fallback categories
const DEFAULT_CATEGORIES = [
    { id: '1', name: 'משכורת', type: 'income', icon: '💰' },
    { id: '2', name: 'מזון וקניות', type: 'expense', icon: '🛒' },
    { id: '3', name: 'מגורים וחשבונות', type: 'expense', icon: '🏠' },
    { id: '4', name: 'תחבורה ורכב', type: 'expense', icon: '🚗' },
    { id: '5', name: 'בילויים ופנאי', type: 'expense', icon: '🎉' }
];

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

function initApp() {
    loadStoredConfig();
    calculatePeriodKey();
    initSupabaseClient();
}

// Calculate active monthly cycle based on cycle start day
function calculatePeriodKey() {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1; // 1-12

    if (now.getDate() < state.cycleDay) {
        month -= 1;
        if (month === 0) {
            month = 12;
            year -= 1;
        }
    }

    state.currentPeriodKey = `${year}-${String(month).padStart(2, '0')}`;

    // Format dates for header
    const startDate = new Date(year, month - 1, state.cycleDay);
    const endDate = new Date(year, month, state.cycleDay - 1);

    const formatDate = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const periodEl = document.getElementById('budget-period-display');
    if (periodEl) {
        periodEl.textContent = `${formatDate(startDate)} - ${formatDate(endDate)}`;
    }
}

// Initialize Supabase Connection
function initSupabaseClient() {
    const url = localStorage.getItem('sb_url');
    const key = localStorage.getItem('sb_key');

    if (url && key && window.supabase) {
        try {
            state.supabase = window.supabase.createClient(url, key);
            state.isConnected = true;
            updateSyncStatus(true);
            fetchData();
            subscribeToRealtime();
        } catch (e) {
            console.error('Supabase init error:', e);
            updateSyncStatus(false);
            loadLocalFallbackData();
        }
    } else {
        updateSyncStatus(false);
        loadLocalFallbackData();
    }
}

function updateSyncStatus(connected) {
    const el = document.getElementById('sync-indicator');
    const txt = document.getElementById('sync-text');
    if (el) {
        if (connected) el.classList.add('connected');
        else el.classList.remove('connected');
    }
    if (txt) {
        txt.textContent = connected ? 'מחובר' : 'מקומי';
    }
}

// Fetch all initial data
async function fetchData() {
    if (!state.supabase) return;

    try {
        // 1. Fetch Cycle Setting
        const { data: setRes } = await state.supabase.from('settings').select('*').eq('key', 'cycle_day').maybeSingle();
        if (setRes && setRes.value) {
            state.cycleDay = parseInt(setRes.value, 10);
            calculatePeriodKey();
        }

        // 2. Fetch Categories
        let { data: catRes } = await state.supabase.from('categories').select('*');
        if (!catRes || catRes.length === 0) {
            await state.supabase.from('categories').insert(DEFAULT_CATEGORIES);
            catRes = DEFAULT_CATEGORIES;
        }
        state.categories = catRes;

        // 3. Fetch Budgets
        let { data: budRes } = await state.supabase
            .from('monthly_budgets')
            .select('*')
            .eq('period_key', state.currentPeriodKey);

        state.budgets = budRes || [];

        renderAllViews();
    } catch (err) {
        console.error('Error fetching data:', err);
        loadLocalFallbackData();
    }
}

// Fallback for offline/no API key mode
function loadLocalFallbackData() {
    state.categories = JSON.parse(localStorage.getItem('local_cats')) || DEFAULT_CATEGORIES;
    state.budgets = JSON.parse(localStorage.getItem('local_budgets') || '[]')
        .filter(b => b.period_key === state.currentPeriodKey);
    renderAllViews();
}

function saveLocalFallbackData() {
    localStorage.setItem('local_cats', JSON.stringify(state.categories));
    localStorage.setItem('local_budgets', JSON.stringify(state.budgets));
}

function subscribeToRealtime() {
    if (!state.supabase) return;

    state.supabase
        .channel('public-schema-changes')
        .on('postgres_changes', { event: '*', schema: 'public' }, () => {
            fetchData();
        })
        .subscribe();
}

// Rendering Views
function renderAllViews() {
    renderDashboard();
    renderSetupTab();
    renderSettingsTab();
}

function renderDashboard() {
    let totalPlannedInc = 0, totalActualInc = 0;
    let totalPlannedExp = 0, totalActualExp = 0;

    const expCategoryStats = [];

    state.categories.forEach(cat => {
        const budget = state.budgets.find(b => b.category_id === cat.id) || { planned_amount: 0, actual_amount: 0 };
        const planned = parseFloat(budget.planned_amount || 0);
        const actual = parseFloat(budget.actual_amount || 0);

        if (cat.type === 'income') {
            totalPlannedInc += planned;
            totalActualInc += actual;
        } else {
            totalPlannedExp += planned;
            totalActualExp += actual;
        }

        expCategoryStats.push({ ...cat, planned, actual });
    });

    const remaining = totalActualInc - totalActualExp;

    const incActEl = document.getElementById('dash-income-actual');
    const incPlnEl = document.getElementById('dash-income-planned');
    const expActEl = document.getElementById('dash-expense-actual');
    const expPlnEl = document.getElementById('dash-expense-planned');
    const remEl = document.getElementById('dash-remaining');

    if (incActEl) incActEl.textContent = `₪${totalActualInc.toLocaleString()}`;
    if (incPlnEl) incPlnEl.textContent = `מתוכנן: ₪${totalPlannedInc.toLocaleString()}`;
    if (expActEl) expActEl.textContent = `₪${totalActualExp.toLocaleString()}`;
    if (expPlnEl) expPlnEl.textContent = `מתוכנן: ₪${totalPlannedExp.toLocaleString()}`;

    if (remEl) {
        remEl.textContent = `₪${remaining.toLocaleString()}`;
        remEl.style.color = remaining >= 0 ? 'var(--emerald, #10b981)' : 'var(--coral, #ef4444)';
    }

    const listEl = document.getElementById('category-progress-list');
    if (listEl) {
        listEl.innerHTML = expCategoryStats.map(cat => {
            const isIncome = cat.type === 'income';
            const pct = cat.planned > 0 ? Math.min(Math.round((cat.actual / cat.planned) * 100), 100) : (cat.actual > 0 ? 100 : 0);
            let statusClass = '';
            if (!isIncome) {
                if (pct > 90 && pct <= 100) statusClass = 'warning';
                if (cat.actual > cat.planned && cat.planned > 0) statusClass = 'danger';
            }

            return `
                <div class="cat-item" onclick="openExpenseSheet('${cat.id}', '${cat.name}')">
                    <div class="cat-header">
                        <span>${cat.icon || (isIncome ? '💰' : '📁')} ${cat.name} ${isIncome ? '<small>(הכנסה)</small>' : ''}</span>
                        <span class="cat-amounts">₪${cat.actual.toLocaleString()} / ₪${cat.planned.toLocaleString()}</span>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill ${statusClass}" style="width: ${pct}%; ${isIncome ? 'background-color: var(--emerald);' : ''}"></div>
                    </div>
                </div>
      `;
        }).join('');
    }

    renderChart(expCategoryStats.filter(cat => cat.type === 'expense'));
}

function renderChart(expenses) {
    const chartCanvas = document.getElementById('expenseChart');
    if (!chartCanvas || !window.Chart) return;

    const ctx = chartCanvas.getContext('2d');
    const activeExpenses = expenses.filter(e => e.actual > 0);

    const labels = activeExpenses.map(e => e.name);
    const data = activeExpenses.map(e => e.actual);
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

    if (state.chartInstance) {
        state.chartInstance.destroy();
    }

    state.chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels.length ? labels : ['אין נתונים'],
            datasets: [{
                data: data.length ? data : [1],
                backgroundColor: data.length ? colors : ['#cbd5e1']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', rtl: true }
            }
        }
    });
}

function renderSetupTab() {
    const container = document.getElementById('setup-categories-list');
    if (!container) return;

    container.innerHTML = state.categories.map(cat => {
        const budget = state.budgets.find(b => b.category_id === cat.id) || { planned_amount: 0 };
        return `
      <div class="setup-row">
        <span>${cat.icon || '📁'} ${cat.name} (${cat.type === 'income' ? 'הכנסה' : 'הוצאה'})</span>
        <input type="number" step="10" class="setup-input" data-cat-id="${cat.id}" value="${budget.planned_amount || 0}">
      </div>
    `;
    }).join('');
}

function renderSettingsTab() {
    const urlEl = document.getElementById('cfg-url');
    const keyEl = document.getElementById('cfg-key');
    const cycleEl = document.getElementById('cfg-cycle-day');

    if (urlEl) urlEl.value = localStorage.getItem('sb_url') || '';
    if (keyEl) keyEl.value = localStorage.getItem('sb_key') || '';
    if (cycleEl) cycleEl.value = state.cycleDay;

    const list = document.getElementById('manage-categories-list');
    if (list) {
        list.innerHTML = state.categories.map(cat => `
      <div class="manage-row">
        <span>${cat.icon || '📁'} ${cat.name}</span>
        <button class="btn btn-small btn-outline" onclick="deleteCategory('${cat.id}')">מחק</button>
      </div>
    `).join('');
    }
}

// Event Listeners & Navigation Setup
function setupEventListeners() {
    // Navigation Tabs
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget;
            const tabId = target.dataset.tab;

            if (!tabId) return;

            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

            target.classList.add('active');
            const tabElement = document.getElementById(tabId);
            if (tabElement) {
                tabElement.classList.add('active');
            }
        });
    });

    // Safe Listener Helper
    const bindEvent = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
    };

    bindEvent('btn-close-sheet', 'click', closeExpenseSheet);
    bindEvent('expense-form', 'submit', handleAddExpense);
    bindEvent('setup-form', 'submit', handleSaveSetup);
    bindEvent('btn-activate-month', 'click', handleActivateNewMonth);
    bindEvent('add-category-form', 'submit', handleAddCategory);
    bindEvent('btn-export-csv', 'click', exportCSV);
    bindEvent('btn-export-json', 'click', exportJSON);

    bindEvent('btn-save-config', 'click', () => {
        const url = document.getElementById('cfg-url')?.value.trim() || '';
        const key = document.getElementById('cfg-key')?.value.trim() || '';
        localStorage.setItem('sb_url', url);
        localStorage.setItem('sb_key', key);
        initSupabaseClient();
        alert('הגדרות חיבור נשמרו!');
    });

    bindEvent('btn-save-cycle', 'click', async () => {
        const val = document.getElementById('cfg-cycle-day')?.value;
        if (!val) return;

        state.cycleDay = parseInt(val, 10);
        calculatePeriodKey();

        if (state.supabase) {
            await state.supabase.from('settings').upsert({ key: 'cycle_day', value: String(val) });
        }
        renderAllViews();
        alert('יום המחזור עודכן בהצלחה!');
    });
}

// Expense Quick Log Modal
window.openExpenseSheet = function (catId, catName) {
    const sheet = document.getElementById('expense-sheet');
    if (!sheet) return;

    const idInput = document.getElementById('sheet-category-id');
    const titleEl = document.getElementById('sheet-category-title');
    const amtInput = document.getElementById('sheet-amount');
    const noteInput = document.getElementById('sheet-note');

    if (idInput) idInput.value = catId;
    if (titleEl) titleEl.textContent = `הוספת הוצאה: ${catName}`;
    if (amtInput) amtInput.value = '';
    if (noteInput) noteInput.value = '';

    sheet.classList.add('active');
};

function closeExpenseSheet() {
    const sheet = document.getElementById('expense-sheet');
    if (sheet) sheet.classList.remove('active');
}

async function handleAddExpense(e) {
    e.preventDefault();
    const catId = document.getElementById('sheet-category-id')?.value;
    const amount = parseFloat(document.getElementById('sheet-amount')?.value) || 0;
    const note = document.getElementById('sheet-note')?.value || '';

    if (!catId || amount <= 0) return;

    let budget = state.budgets.find(b => b.category_id === catId);
    const newActual = (budget ? parseFloat(budget.actual_amount || 0) : 0) + amount;

    if (state.supabase) {
        await state.supabase.from('transactions').insert({ category_id: catId, amount, note });
        await state.supabase.from('monthly_budgets').upsert({
            category_id: catId,
            period_key: state.currentPeriodKey,
            planned_amount: budget ? budget.planned_amount : 0,
            actual_amount: newActual
        }, { onConflict: 'category_id,period_key' });

        fetchData();
    } else {
        if (budget) {
            budget.actual_amount = newActual;
        } else {
            state.budgets.push({ category_id: catId, period_key: state.currentPeriodKey, planned_amount: 0, actual_amount: newActual });
        }
        saveLocalFallbackData();
        renderAllViews();
    }

    closeExpenseSheet();
}

async function handleSaveSetup(e) {
    e.preventDefault();
    const inputs = document.querySelectorAll('.setup-input');

    const updates = Array.from(inputs).map(input => {
        const catId = input.dataset.catId;
        const planned = parseFloat(input.value) || 0;
        const existing = state.budgets.find(b => b.category_id === catId);

        return {
            category_id: catId,
            period_key: state.currentPeriodKey,
            planned_amount: planned,
            actual_amount: existing ? existing.actual_amount : 0
        };
    });

    if (state.supabase) {
        await state.supabase.from('monthly_budgets').upsert(updates, { onConflict: 'category_id,period_key' });
        fetchData();
    } else {
        state.budgets = updates;
        saveLocalFallbackData();
        renderAllViews();
    }

    alert('תכנון התקציב שנשמר בהצלחה!');
}

async function handleActivateNewMonth() {
    if (!confirm('האם אתה בטוח שברצונך לאפס הוצאות בפועל ולהתחיל חודש חדש?')) return;

    const resetBudgets = state.categories.map(cat => {
        const existing = state.budgets.find(b => b.category_id === cat.id);
        return {
            category_id: cat.id,
            period_key: state.currentPeriodKey,
            planned_amount: existing ? existing.planned_amount : 0,
            actual_amount: 0
        };
    });

    if (state.supabase) {
        await state.supabase.from('monthly_budgets').upsert(resetBudgets, { onConflict: 'category_id,period_key' });
        fetchData();
    } else {
        state.budgets = resetBudgets;
        saveLocalFallbackData();
        renderAllViews();
    }

    alert('החודש החדש הופעל בהצלחה!');
}

async function handleAddCategory(e) {
    e.preventDefault();
    const nameEl = document.getElementById('new-cat-name');
    const typeEl = document.getElementById('new-cat-type');

    const name = nameEl?.value.trim();
    const type = typeEl?.value || 'expense';

    if (!name) return;

    const newCat = { name, type, icon: type === 'income' ? '💵' : '💸' };

    if (state.supabase) {
        await state.supabase.from('categories').insert([newCat]);
        fetchData();
    } else {
        newCat.id = String(Date.now());
        state.categories.push(newCat);
        saveLocalFallbackData();
        renderAllViews();
    }

    if (nameEl) nameEl.value = '';
}

window.deleteCategory = async function (catId) {
    if (!confirm('למחוק קטגוריה זו?')) return;

    if (state.supabase) {
        await state.supabase.from('categories').delete().eq('id', catId);
        fetchData();
    } else {
        state.categories = state.categories.filter(c => c.id !== catId);
        saveLocalFallbackData();
        renderAllViews();
    }
};

// Data Exports
function exportCSV() {
    let csv = '\uFEFF'; // UTF-8 BOM for Hebrew Excel
    csv += 'קטגוריה,סוג,מתוכנן,בפועל,תקופה\n';

    state.categories.forEach(cat => {
        const b = state.budgets.find(item => item.category_id === cat.id) || { planned_amount: 0, actual_amount: 0 };
        csv += `"${cat.name}","${cat.type === 'income' ? 'הכנסה' : 'הוצאה'}",${b.planned_amount},${b.actual_amount},"${state.currentPeriodKey}"\n`;
    });

    downloadFile(csv, `budget_${state.currentPeriodKey}.csv`, 'text/csv;charset=utf-8;');
}

function exportJSON() {
    const data = {
        period: state.currentPeriodKey,
        categories: state.categories,
        budgets: state.budgets
    };
    downloadFile(JSON.stringify(data, null, 2), `budget_${state.currentPeriodKey}.json`, 'application/json');
}

function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
}

function loadStoredConfig() {
    const day = localStorage.getItem('cycle_day');
    if (day) state.cycleDay = parseInt(day, 10);
}