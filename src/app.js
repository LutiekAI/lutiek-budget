// State
let transactions = [];
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let editingId = null;
let selectedType = 'expense';

const CATEGORIES = {
    expense: ['Food', 'Transport', 'Bills', 'Entertainment', 'Health', 'Shopping', 'Other'],
    income: ['Salary', 'Freelance', 'Investment', 'Gift', 'Other']
};

const CATEGORY_ICONS = {
    Food: '🍔', Transport: '🚗', Bills: '📄', Entertainment: '🎬',
    Health: '💊', Shopping: '🛒', Other: '📦',
    Salary: '💰', Freelance: '💻', Investment: '📈', Gift: '🎁'
};

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

// Init
document.addEventListener('DOMContentLoaded', async () => {
    await loadTransactions();
    render();
    setupEventListeners();
});

// Tauri Commands
async function loadTransactions() {
    try {
        transactions = await window.__TAURI__.core.invoke('get_transactions');
    } catch (e) {
        console.error('Failed to load transactions:', e);
        transactions = [];
    }
}

async function addTransaction(tx) {
    try {
        const newTx = await window.__TAURI__.core.invoke('add_transaction', {
            txType: tx.type,
            amount: tx.amount,
            category: tx.category,
            description: tx.description,
            date: tx.date
        });
        transactions.push(newTx);
        render();
    } catch (e) {
        console.error('Failed to add transaction:', e);
    }
}

async function updateTransaction(tx) {
    try {
        const updated = await window.__TAURI__.core.invoke('update_transaction', {
            id: tx.id,
            txType: tx.type,
            amount: tx.amount,
            category: tx.category,
            description: tx.description,
            date: tx.date
        });
        const idx = transactions.findIndex(t => t.id === tx.id);
        if (idx !== -1) transactions[idx] = updated;
        render();
    } catch (e) {
        console.error('Failed to update transaction:', e);
    }
}

async function deleteTransaction(id) {
    try {
        await window.__TAURI__.core.invoke('delete_transaction', { id });
        transactions = transactions.filter(t => t.id !== id);
        render();
    } catch (e) {
        console.error('Failed to delete transaction:', e);
    }
}

// Filter
function getMonthTransactions() {
    return transactions.filter(tx => {
        const d = new Date(tx.date);
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
}

function getMonthlyStats() {
    const mtx = getMonthTransactions();
    let income = 0, expenses = 0;
    mtx.forEach(tx => {
        if (tx.type === 'income') income += tx.amount;
        else expenses += tx.amount;
    });
    return { income, expenses, balance: income - expenses };
}

function getCategoryExpenses() {
    const mtx = getMonthTransactions().filter(tx => tx.type === 'expense');
    const map = {};
    mtx.forEach(tx => {
        map[tx.category] = (map[tx.category] || 0) + tx.amount;
    });
    return map;
}

// Render
function render() {
    renderMonthLabel();
    renderSummary();
    renderTransactions();
    renderChart();
}

function renderMonthLabel() {
    document.getElementById('currentMonthLabel').textContent =
        `${MONTH_NAMES[currentMonth]} ${currentYear}`;
}

function renderSummary() {
    const { income, expenses, balance } = getMonthlyStats();
    const incomeEl = document.getElementById('totalIncome');
    const expenseEl = document.getElementById('totalExpenses');
    const balanceEl = document.getElementById('balance');

    incomeEl.textContent = formatCurrency(income);
    expenseEl.textContent = formatCurrency(expenses);
    balanceEl.textContent = formatCurrency(balance);

    balanceEl.classList.toggle('negative', balance < 0);
}

function renderTransactions() {
    const list = document.getElementById('transactionsList');
    const mtx = getMonthTransactions();

    if (mtx.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>No transactions this month.<br>Click + Add to get started.</p></div>';
        return;
    }

    // Running balance
    let running = getMonthlyStats().income;
    let items = [];
    mtx.forEach(tx => {
        if (tx.type === 'expense') {
            running -= tx.amount;
        } else {
            running += tx.amount;
        }
    });

    // Build items in display order (newest first), calculate running
    let balanceMap = {};
    let balance = getMonthlyStats().income;
    let txArr = [...mtx].reverse();
    txArr.forEach(tx => {
        balanceMap[tx.id] = tx.type === 'expense' ? (balance -= tx.amount) : (balance += tx.amount);
    });

    list.innerHTML = mtx.map(tx => `
        <div class="tx-item" data-id="${tx.id}">
            <div class="tx-icon ${tx.type}">${CATEGORY_ICONS[tx.category] || '📦'}</div>
            <div class="tx-info">
                <div class="tx-category">${tx.category}</div>
                <div class="tx-desc">${tx.description || '&mdash;'}</div>
            </div>
            <div class="tx-meta">
                <span class="tx-amount ${tx.type}">${tx.type === 'income' ? '+' : '-'}${formatCurrency(tx.amount)}</span>
                <span class="tx-date">${formatDate(tx.date)}</span>
                <span class="tx-date" style="color:var(--accent);font-size:11px;">Bal: ${formatCurrency(balanceMap[tx.id])}</span>
            </div>
            <div class="tx-actions">
                <button class="edit" title="Edit" onclick="openEditModal('${tx.id}')">✏️</button>
                <button class="delete" title="Delete" onclick="confirmDelete('${tx.id}')">🗑️</button>
            </div>
        </div>
    `).join('');
}

function renderChart() {
    const container = document.getElementById('chartContainer');
    const catExp = getCategoryExpenses();
    const total = Object.values(catExp).reduce((a, b) => a + b, 0);

    if (total === 0) {
        container.innerHTML = '<h2>Spending by Category</h2><div class="chart-placeholder">No expenses this month</div>';
        return;
    }

    const sorted = Object.entries(catExp).sort((a, b) => b[1] - a[1]);
    const maxVal = sorted[0][1];

    let bars = sorted.map(([cat, val]) => {
        const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
        return `
        <div class="chart-bar-group">
            <div class="chart-bar-label">
                <span>${CATEGORY_ICONS[cat] || ''} ${cat}</span>
                <span>${formatCurrency(val)}</span>
            </div>
            <div class="chart-bar-track">
                <div class="chart-bar-fill" style="width:${pct}%"></div>
            </div>
        </div>
        `;
    }).join('');

    container.innerHTML = `<h2>Spending by Category</h2>${bars}`;
}

// Formatting helpers
function formatCurrency(amount) {
    return '$' + Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Event listeners
function setupEventListeners() {
    document.getElementById('prevMonth').addEventListener('click', () => {
        currentMonth--;
        if (currentMonth < 0) { currentMonth = 11; currentYear--; }
        render();
    });

    document.getElementById('nextMonth').addEventListener('click', () => {
        currentMonth++;
        if (currentMonth > 11) { currentMonth = 0; currentYear++; }
        render();
    });

    document.getElementById('addBtn').addEventListener('click', openAddModal);
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('cancelBtn').addEventListener('click', closeModal);
    document.getElementById('modal').addEventListener('click', (e) => {
        if (e.target.id === 'modal') closeModal();
    });

    document.getElementById('transactionForm').addEventListener('submit', handleSubmit);

    // Type toggle
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedType = btn.dataset.type;
            updateCategoryOptions();
        });
    });
}

// Modal
function openAddModal() {
    editingId = null;
    document.getElementById('modalTitle').textContent = 'Add Transaction';
    document.getElementById('transactionForm').reset();
    document.getElementById('date').value = new Date().toISOString().split('T')[0];
    selectedType = 'expense';
    document.querySelectorAll('.type-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.type === 'expense');
    });
    updateCategoryOptions();
    document.getElementById('modal').classList.remove('hidden');
}

function openEditModal(id) {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;
    editingId = id;
    document.getElementById('modalTitle').textContent = 'Edit Transaction';
    document.getElementById('amount').value = tx.amount;
    document.getElementById('description').value = tx.description;
    document.getElementById('date').value = tx.date;
    selectedType = tx.type;
    document.querySelectorAll('.type-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.type === tx.type);
    });
    updateCategoryOptions();
    document.getElementById('category').value = tx.category;
    document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal').classList.add('hidden');
    editingId = null;
}

function updateCategoryOptions() {
    const select = document.getElementById('category');
    const cats = CATEGORIES[selectedType];
    select.innerHTML = '<option value="">Select category</option>' +
        cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

function handleSubmit(e) {
    e.preventDefault();
    const type = selectedType;
    const amount = parseFloat(document.getElementById('amount').value);
    const category = document.getElementById('category').value;
    const description = document.getElementById('description').value.trim();
    const date = document.getElementById('date').value;

    if (!amount || !category || !date) return;

    const tx = { type, amount, category, description, date };
    if (editingId) {
        tx.id = editingId;
        updateTransaction(tx);
    } else {
        addTransaction(tx);
    }
    closeModal();
}

function confirmDelete(id) {
    if (confirm('Delete this transaction?')) {
        deleteTransaction(id);
    }
}

// Expose to global
window.openEditModal = openEditModal;
window.confirmDelete = confirmDelete;
