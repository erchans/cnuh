// PREMIUM ASSET LEDGER - CORE ENGINE

// 1. Initial Mock Database for Stocks
const STOCK_DATABASE = {
    "AAPL": { name: "Apple Inc.", basePrice: 190.25, sector: "IT" },
    "TSLA": { name: "Tesla Inc.", basePrice: 178.50, sector: "테크" },
    "NVDA": { name: "NVIDIA Corp.", basePrice: 940.80, sector: "테크" },
    "MSFT": { name: "Microsoft Corp.", basePrice: 425.30, sector: "IT" },
    "AMZN": { name: "Amazon.com Inc.", basePrice: 181.10, sector: "IT" },
    "GOOGL": { name: "Alphabet Inc.", basePrice: 175.40, sector: "IT" },
    "META": { name: "Meta Platforms Inc.", basePrice: 475.20, sector: "IT" },
    "NFLX": { name: "Netflix Inc.", basePrice: 620.10, sector: "IT" },
    "LLY": { name: "Eli Lilly and Company", basePrice: 1068.12, sector: "제약/바이오" },
    "AVGO": { name: "Broadcom Inc.", basePrice: 1400.0, sector: "테크" },
    "AMD": { name: "Advanced Micro Devices Inc.", basePrice: 165.0, sector: "테크" },
    "QCOM": { name: "QUALCOMM Inc.", basePrice: 185.0, sector: "테크" },
    "JPM": { name: "JPMorgan Chase & Co.", basePrice: 195.0, sector: "금융" },
    "V": { name: "Visa Inc.", basePrice: 275.0, sector: "금융" },
    "WMT": { name: "Walmart Inc.", basePrice: 65.0, sector: "유통" },
    "COST": { name: "Costco Wholesale Corp.", basePrice: 810.0, sector: "유통" },
    "005930.KS": { name: "삼성전자", basePrice: 75000 / 1350.0, sector: "테크" },
    "000660.KS": { name: "SK하이닉스", basePrice: 185000 / 1350.0, sector: "테크" },
    "035420.KS": { name: "NAVER", basePrice: 190000 / 1350.0, sector: "IT" },
    "035720.KS": { name: "카카오", basePrice: 48000 / 1350.0, sector: "IT" },
    "005380.KS": { name: "현대차", basePrice: 250000 / 1350.0, sector: "제조" }
};

// 2. Default Seed Data
const DEFAULT_STATE = {
    exchangeRate: 1350.0,
    weeklyBudget: 200000,
    cashAccounts: [{id: "cash_1", name: "현금 계좌 1", amount: 0}],
    stocks: [],
    transactions: [],
    realizedTrades: [],
    realEstate: [],
    historicalProfitEntries: [],
    debts: [],
    accounts: [
        { id: "1", name: "주식계좌 1" },
        { id: "2", name: "주식계좌 2" }
    ]
};

// State Object and UI Chart instances
let AppState = {};
let donutChart = null;
let comboChart = null;
let growthChart = null;
let lastStockPrices = {};
let sortCol = 'ticker';
let sortAsc = true;
let simSeconds = 20.0;
let simInterval = null;
let editingRealEstateId = null;
let editingDebtId = null;
let currentAccountFilter = 'all';
let currentDonutView = 'all';
let ledgerViewMode = 'monthly';
let ledgerCurrentDate = new Date();
let ledgerCumulChart = null;
let currentMarketFilter = 'US';

// 3. Helper Functions
function getRecentMonths(count = 6) {
    const result = [];
    const d = new Date();
    for (let i = count - 1; i >= 0; i--) {
        const temp = new Date(d.getFullYear(), d.getMonth() - i, 1);
        const y = temp.getFullYear();
        const m = String(temp.getMonth() + 1).padStart(2, '0');
        result.push(`${y}-${m}`);
    }
    return result;
}

function formatKoreanAmount(val) {
    const manVal = Math.round(val / 10000); // 만원 단위 반올림
    if (manVal === 0) return "0원";
    
    let result = "";
    let remainder = manVal;
    
    const eok = Math.floor(remainder / 10000); // 1억 = 10,000만
    remainder = remainder % 10000;
    
    if (eok > 0) {
        result += eok + "억 ";
    }
    
    const cheon = Math.floor(remainder / 1000);
    remainder = remainder % 1000;
    if (cheon > 0) {
        result += cheon + "천";
    }
    
    const baek = Math.floor(remainder / 100);
    remainder = remainder % 100;
    if (baek > 0) {
        result += baek + "백";
    }
    
    const sip = Math.floor(remainder / 10);
    remainder = remainder % 10;
    if (sip > 0) {
        result += sip + "십";
    }
    
    if (remainder > 0 || result === "") {
        result += remainder;
    }
    
    result += "만원";
    return result.trim();
}

function getOffsetDate(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

function formatKRW(val) {
    return "₩" + Math.round(val).toLocaleString('ko-KR');
}

function formatUSD(val) {
    return "$" + parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(val) {
    let prefix = val > 0 ? "+" : "";
    return prefix + val.toFixed(2) + "%";
}

function getCashTotal() {
    return (AppState.cashAccounts || []).reduce((sum, acc) => sum + (acc.amount || 0), 0);
}

function saveState() {
    localStorage.setItem("junyoung_asset_ledger_state", JSON.stringify(AppState));
}

// 4. API Timeout and Proxy Fallback Chain
async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

async function fetchWithFallback(url) {
    const proxies = [
        // 1. Corsproxy.io (Very fast in browsers, only blocked server-side in node/curl tests)
        async (targetUrl) => {
            const res = await fetchWithTimeout(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`, {}, 2500);
            if (!res.ok) throw new Error("corsproxy.io status " + res.status);
            const text = await res.clone().text();
            if (text.includes("requests are not allowed") || text.includes("pricing") || text.includes("error")) {
                throw new Error("corsproxy.io blocked request");
            }
            return await res.json();
        },
        // 2. Codetabs proxy
        async (targetUrl) => {
            const res = await fetchWithTimeout(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`, {}, 2500);
            if (!res.ok) throw new Error("codetabs status " + res.status);
            const text = await res.clone().text();
            if (text.includes("Too Many Requests") || text.includes("error")) {
                throw new Error("codetabs blocked request");
            }
            return JSON.parse(text);
        },
        // 3. Allorigins get (wrapped JSON)
        async (targetUrl) => {
            const res = await fetchWithTimeout(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`, {}, 2500);
            if (!res.ok) throw new Error("allorigins-get status " + res.status);
            const data = await res.json();
            if (!data.contents) throw new Error("allorigins-get returned empty contents");
            return JSON.parse(data.contents);
        },
        // 4. Allorigins raw
        async (targetUrl) => {
            const res = await fetchWithTimeout(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, {}, 2500);
            if (!res.ok) throw new Error("allorigins-raw status " + res.status);
            return await res.json();
        }
    ];

    let lastError = null;
    for (const proxyFn of proxies) {
        try {
            const data = await proxyFn(url);
            if (data) return data;
        } catch (e) {
            console.warn(`Proxy failed for ${url}:`, e.message);
            lastError = e;
        }
    }
    throw lastError || new Error("All proxies failed");
}

// 5. Autocomplete Ticker Search & Quote Resolution
const KOREAN_STOCK_TICKER_MAP = {
    "삼성전자": "005930.KS",
    "SK하이닉스": "000660.KS",
    "LG에너지솔루션": "373220.KS",
    "삼성바이오로직스": "207940.KS",
    "현대차": "005380.KS",
    "기아": "000270.KS",
    "셀트리온": "068270.KS",
    "POSCO홀딩스": "005490.KS",
    "포스코홀딩스": "005490.KS",
    "NAVER": "035420.KS",
    "네이버": "035420.KS",
    "카카오": "035720.KS",
    "삼성SDI": "006400.KS",
    "LG화학": "051910.KS",
    "KB금융": "105560.KS",
    "신한지주": "055550.KS",
    "포스코퓨처엠": "003670.KS",
    "카카오뱅크": "323410.KS",
    "에코프로비엠": "247540.KQ",
    "에코프로": "086520.KQ",
    "HLB": "028300.KQ",
    "알테오젠": "196170.KQ",
    "HPSP": "403870.KQ",
    "엔켐": "348370.KQ",
    "리노공업": "058470.KQ",
    "레인보우로보틱스": "277810.KQ",
    "솔브레인": "357780.KQ",
    "삼성물산": "028260.KS",
    "현대모비스": "012330.KS",
    "포스코인터내셔널": "047050.KS",
    "삼성생명": "032830.KS",
    "LG전자": "066570.KS",
    "하나금융지주": "086790.KS",
    "메리츠금융지주": "138040.KS",
    "SK": "034730.KS",
    "삼성화재": "000810.KS",
    "KT&G": "033780.KS",
    "케이티앤지": "033780.KS",
    "HD현대중공업": "329180.KS",
    "한국전력": "015760.KS",
    "두산에너빌리티": "034020.KS",
    "SK텔레콤": "017670.KS",
    "삼성E&A": "028050.KS",
    "삼성엔지니어링": "028050.KS",
    "S-OIL": "010950.KS",
    "에스오일": "010950.KS",
    "고려아연": "010130.KS",
    "한화오션": "042660.KS",
    "대한항공": "003490.KS",
    "우리금융지주": "316140.KS",
    "기업은행": "024110.KS",
    "KT": "030200.KS",
    "케이티": "030200.KS",
    "크래프톤": "259960.KS",
    "한미반도체": "042700.KS",
    "HD현대일렉트릭": "267260.KS",
    "한화에어로스페이스": "012450.KS",
    "현대글로비스": "086280.KS",
    "삼성중공업": "010140.KS",
    "금양": "001570.KS",
    "LG디스플레이": "034220.KS",
    "LG생활건강": "051900.KS",
    "두산로보틱스": "454910.KS",
    "한온시스템": "018880.KS",
    "포스코DX": "022100.KS",
    "하이브": "352820.KS",
    "넷마블": "251270.KS",
    "유한양행": "000100.KS",
    "한화솔루션": "009830.KS",
    "LG유플러스": "032640.KS",
    "오리온": "271560.KS",
    "HLB생명과학": "067630.KQ",
    "루닛": "328130.KQ",
    "휴젤": "145020.KQ",
    "펄어비스": "263750.KQ",
    "씨젠": "096530.KQ",
    "JYP Ent.": "035900.KQ",
    "JYP": "035900.KQ",
    "와이지엔터테인먼트": "122870.KQ",
    "에스엠": "041510.KQ",
    "동진쎄미켐": "005290.KQ",
    "원익IPS": "240810.KQ",
    "클래시스": "214150.KQ",
    "파두": "440110.KQ"
};

function getSeedRandom(seedStr) {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
        hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const x = Math.sin(hash) * 10000;
    return x - Math.floor(x);
}

async function resolveTicker(query, market = 'US') {
    query = query.trim();
    if (!query) return null;

    // Check if it's a known Korean Hangul stock name in our local dictionary
    if (market === 'KR' && KOREAN_STOCK_TICKER_MAP[query]) {
        const symbol = KOREAN_STOCK_TICKER_MAP[query];
        return {
            symbol: symbol,
            name: query
        };
    }

    const queryUpper = query.toUpperCase();
    
    // If it's a known ticker in our database, return immediately
    if (STOCK_DATABASE[queryUpper]) {
        return {
            symbol: queryUpper,
            name: STOCK_DATABASE[queryUpper].name
        };
    }

    // Bypass Yahoo Finance Search API for 6-digit domestic stock codes
    if (market === 'KR' && /^\d{6}$/.test(query)) {
        return {
            symbol: query + ".KS",
            name: query
        };
    }
    
    // Autocomplete search on Yahoo Finance
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=3`;
    try {
        const data = await fetchWithFallback(url);
        if (data && data.quotes && data.quotes.length > 0) {
            if (market === 'KR') {
                const krQuote = data.quotes.find(q => q.symbol.endsWith('.KS') || q.symbol.endsWith('.KQ'));
                if (krQuote) {
                    return {
                        symbol: krQuote.symbol,
                        name: krQuote.shortname || krQuote.longname || krQuote.symbol
                    };
                }
            }
            const quote = data.quotes[0];
            return {
                symbol: quote.symbol,
                name: quote.shortname || quote.longname || quote.symbol
            };
        }
    } catch (e) {
        console.error("Ticker resolution failed for: " + query, e);
    }
    
    return {
        symbol: queryUpper,
        name: query
    };
}

// 6. Core Calculations
function computeHoldingsAndRealized(accountFilter = 'all', marketFilter = 'all') {
    const holdings = {};
    let totalRealizedKRW = 0;
    
    const sortedTrades = [...(AppState.realizedTrades || [])]
        .filter(t => (accountFilter === 'all' || (t.account || '1') === accountFilter) &&
                     (marketFilter === 'all' || (t.market || 'US') === marketFilter))
        .sort((a, b) => a.date.localeCompare(b.date));
    
    sortedTrades.forEach(trade => {
        const ticker = trade.ticker;
        let name = ticker;
        if (STOCK_DATABASE[ticker]) {
            name = STOCK_DATABASE[ticker].name;
        }
        
        if (trade.type === 'buy') {
            if (!holdings[ticker]) {
                holdings[ticker] = {
                    ticker,
                    name: name || ticker,
                    qty: 0,
                    totalCostUSD: 0,
                    avgPriceUSD: 0,
                    currentPriceUSD: STOCK_DATABASE[ticker] ? STOCK_DATABASE[ticker].basePrice : trade.price,
                    sector: trade.sector || (STOCK_DATABASE[ticker] ? STOCK_DATABASE[ticker].sector : "기타"),
                    market: trade.market || 'US'
                };
            }
            holdings[ticker].qty += trade.qty;
            holdings[ticker].totalCostUSD += trade.qty * trade.price;
            holdings[ticker].avgPriceUSD = holdings[ticker].qty > 0 ? (holdings[ticker].totalCostUSD / holdings[ticker].qty) : 0;
            if (trade.sector) {
                holdings[ticker].sector = trade.sector;
            }
        } else if (trade.type === 'sell') {
            if (holdings[ticker]) {
                const sellQty = Math.min(trade.qty, holdings[ticker].qty);
                const realizedUSD = (trade.price - holdings[ticker].avgPriceUSD) * sellQty;
                const realizedKRW = realizedUSD * AppState.exchangeRate;
                totalRealizedKRW += realizedKRW;
                
                holdings[ticker].qty -= sellQty;
                holdings[ticker].totalCostUSD = holdings[ticker].qty * holdings[ticker].avgPriceUSD;
                
                if (holdings[ticker].qty <= 0) {
                    delete holdings[ticker];
                }
            } else {
                const realizedUSD = trade.price * trade.qty;
                const realizedKRW = realizedUSD * AppState.exchangeRate;
                totalRealizedKRW += realizedKRW;
            }
        }
    });
    
    const activeStocks = Object.values(holdings).map(h => {
        const buyPriceKRW = h.avgPriceUSD * AppState.exchangeRate;
        return {
            id: "s_calc_" + h.ticker,
            ticker: h.ticker,
            name: h.name,
            qty: h.qty,
            buyPrice: buyPriceKRW,
            currentPriceUSD: STOCK_DATABASE[h.ticker] ? STOCK_DATABASE[h.ticker].basePrice : h.avgPriceUSD,
            sector: h.sector || "기타",
            market: h.market || 'US'
        };
    });
    
    return { stocks: activeStocks, realizedProfitKRW: totalRealizedKRW };
}

// 7. Sort Holdings Logic
function sortHoldings(col) {
    if (sortCol === col) {
        sortAsc = !sortAsc;
    } else {
        sortCol = col;
        sortAsc = true;
    }
    updateUI(true); // Redraw with sorting, skip recalculating holdings from trades
}

function sortStocksInternal() {
    AppState.stocks.sort((a, b) => {
        let valA = 0;
        let valB = 0;
        
        const costA = a.buyPrice * a.qty;
        const currentPriceKRWA = a.currentPriceUSD * AppState.exchangeRate;
        const evalKRWA = currentPriceKRWA * a.qty;
        const profitKRWA = evalKRWA - costA;
        const yieldA = costA > 0 ? (profitKRWA / costA) * 100 : 0;

        const costB = b.buyPrice * b.qty;
        const currentPriceKRWB = b.currentPriceUSD * AppState.exchangeRate;
        const evalKRWB = currentPriceKRWB * b.qty;
        const profitKRWB = evalKRWB - costB;
        const yieldB = costB > 0 ? (profitKRWB / costB) * 100 : 0;

        if (sortCol === 'ticker') {
            valA = a.ticker;
            valB = b.ticker;
        } else if (sortCol === 'sector') {
            valA = a.sector || '기타';
            valB = b.sector || '기타';
        } else if (sortCol === 'qty') {
            valA = a.qty;
            valB = b.qty;
        } else if (sortCol === 'buyPrice') {
            valA = a.buyPrice;
            valB = b.buyPrice;
        } else if (sortCol === 'currentPrice') {
            valA = a.currentPriceUSD;
            valB = b.currentPriceUSD;
        } else if (sortCol === 'eval') {
            valA = evalKRWA;
            valB = evalKRWB;
        } else if (sortCol === 'profit') {
            valA = profitKRWA;
            valB = profitKRWB;
        } else if (sortCol === 'buyCost') {
            valA = costA;
            valB = costB;
        } else if (sortCol === 'yield') {
            valA = yieldA;
            valB = yieldB;
        }
        
        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
    });
}

// 7-2. Dynamic Account Management Rendering
function renderAccountFilters() {
    const holdingsContainer = document.getElementById("holdings-acc-filter-container");
    const tradesContainer = document.getElementById("trades-acc-filter-container");
    if (!holdingsContainer || !tradesContainer) return;

    // Render holdings account filters
    let holdingsHTML = `<button type="button" class="btn btn-text btn-xs ${currentAccountFilter === 'all' ? 'active' : ''}" id="btn-acc-filter-all">계좌 모아보기</button>`;
    (AppState.accounts || []).forEach(acc => {
        holdingsHTML += `<button type="button" class="btn btn-text btn-xs ${currentAccountFilter === acc.id ? 'active' : ''}" data-acc-id="${acc.id}">${acc.name}</button>`;
    });
    holdingsContainer.innerHTML = holdingsHTML;

    // Render trades account filters
    let tradesHTML = `<button type="button" class="btn btn-text btn-xs ${currentAccountFilter === 'all' ? 'active' : ''}" id="btn-trade-filter-all">계좌 모아보기</button>`;
    (AppState.accounts || []).forEach(acc => {
        tradesHTML += `<button type="button" class="btn btn-text btn-xs ${currentAccountFilter === acc.id ? 'active' : ''}" data-acc-id="${acc.id}">${acc.name}</button>`;
    });
    tradesContainer.innerHTML = tradesHTML;

    // Bind event listeners to holdings filters
    holdingsContainer.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", function() {
            const accId = this.id === "btn-acc-filter-all" ? "all" : this.getAttribute("data-acc-id");
            currentAccountFilter = accId;
            renderAccountFilters(); // update active classes
            updateUI(true); // redraw tables
        });
    });

    // Bind event listeners to trades filters
    tradesContainer.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", function() {
            const accId = this.id === "btn-trade-filter-all" ? "all" : this.getAttribute("data-acc-id");
            currentAccountFilter = accId;
            renderAccountFilters(); // update active classes
            updateUI(true); // redraw tables
        });
    });
}

function renderAccountSelectors() {
    const stockAccSelect = document.getElementById("stock-account");
    const tradeAccSelect = document.getElementById("trade-account");
    if (!stockAccSelect || !tradeAccSelect) return;

    let optionsHTML = "";
    (AppState.accounts || []).forEach(acc => {
        optionsHTML += `<option value="${acc.id}">${acc.name}</option>`;
    });

    stockAccSelect.innerHTML = optionsHTML;
    tradeAccSelect.innerHTML = optionsHTML;
}

function renderAccountManager() {
    const managerListContainer = document.getElementById("acc-manager-list-container");
    if (!managerListContainer) return;

    let html = "";
    (AppState.accounts || []).forEach(acc => {
        html += `
            <div class="acc-manager-item" data-acc-id="${acc.id}" style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem;">
                <input type="text" class="acc-name-edit-input" value="${acc.name}" style="background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-family: Outfit; font-size: 0.8rem; padding: 0.25rem 0.5rem; flex: 1; outline: none;">
                <button type="button" class="btn btn-primary btn-xs btn-save-acc-name" style="padding: 0.25rem 0.5rem;">저장</button>
                <button type="button" class="btn btn-icon-only text-danger btn-delete-acc" style="padding: 0.25rem; font-size: 0.75rem;" title="계좌 삭제"><i data-lucide="trash-2" style="width:12px; height:12px;"></i></button>
            </div>
        `;
    });
    managerListContainer.innerHTML = html;

    // Bind save button listeners
    managerListContainer.querySelectorAll(".btn-save-acc-name").forEach(btn => {
        btn.addEventListener("click", function() {
            const itemDiv = this.closest(".acc-manager-item");
            const accId = itemDiv.getAttribute("data-acc-id");
            const newName = itemDiv.querySelector(".acc-name-edit-input").value.trim();
            if (!newName) {
                alert("계좌 이름을 입력해 주세요.");
                return;
            }
            const acc = AppState.accounts.find(a => a.id === accId);
            if (acc) {
                acc.name = newName;
                saveState();
                renderAccountFilters();
                renderAccountSelectors();
                renderAccountManager();
                updateUI(true);
                alert("계좌 이름이 변경되었습니다.");
            }
        });
    });

    // Bind delete button listeners
    managerListContainer.querySelectorAll(".btn-delete-acc").forEach(btn => {
        btn.addEventListener("click", function() {
            const itemDiv = this.closest(".acc-manager-item");
            const accId = itemDiv.getAttribute("data-acc-id");
            const acc = AppState.accounts.find(a => a.id === accId);
            if (!acc) return;

            if (AppState.accounts.length <= 1) {
                alert("최소 하나의 주식 계좌는 존재해야 합니다.");
                return;
            }

            const confirmMsg = `계좌 "${acc.name}"을(를) 삭제하시겠습니까?\n삭제 시 해당 계좌에 소속된 모든 보유 주식 및 매매 기록이 함께 영구 삭제됩니다.`;
            if (confirm(confirmMsg)) {
                // Delete trades belonging to this account
                AppState.realizedTrades = (AppState.realizedTrades || []).filter(t => (t.account || '1') !== accId);
                
                // Delete account itself
                AppState.accounts = AppState.accounts.filter(a => a.id !== accId);
                
                if (currentAccountFilter === accId) {
                    currentAccountFilter = 'all';
                }

                saveState();
                renderAccountFilters();
                renderAccountSelectors();
                renderAccountManager();
                updateUI();
                updateCharts();
            }
        });
    });

    lucide.createIcons();
}

// 7b. Render RAW data account selector
function renderRawAccountSelector() {
    const sel = document.getElementById("raw-acc-select");
    if (!sel) return;
    let html = '';
    (AppState.accounts || []).forEach(acc => {
        html += `<option value="${acc.id}">${acc.name}</option>`;
    });
    sel.innerHTML = html;
}

// 7c. Render Tax Profit Entries
function renderTaxEntries() {
    const container = document.getElementById("tax-profit-entries-list");
    const totalEl = document.getElementById("tax-historical-total");
    if (!container) return;
    
    let html = '';
    let total = 0;
    (AppState.historicalProfitEntries || []).forEach(entry => {
        total += entry.amount;
        html += `<div class="tax-entry-item" data-id="${entry.id}">
            <span class="entry-desc">${entry.desc}</span>
            <span class="entry-amount">${formatKRW(entry.amount)}</span>
            <button type="button" class="btn-del-entry" data-id="${entry.id}">✕</button>
        </div>`;
    });
    container.innerHTML = html;
    if (totalEl) totalEl.innerText = formatKRW(total);
    
    container.querySelectorAll(".btn-del-entry").forEach(btn => {
        btn.addEventListener("click", function() {
            const id = this.getAttribute("data-id");
            AppState.historicalProfitEntries = AppState.historicalProfitEntries.filter(e => e.id !== id);
            saveState();
            renderTaxEntries();
            updateUI(true);
        });
    });
}

// 7d. Render Cash Accounts
function renderCashAccounts() {
    const tbody = document.getElementById("cash-accounts-tbody");
    const totalEl = document.getElementById("cash-tab-total-val");
    if (!tbody) return;
    
    const total = getCashTotal();
    if (totalEl) totalEl.innerText = formatKRW(total);
    
    let html = '';
    (AppState.cashAccounts || []).forEach(acc => {
        html += `<tr data-cash-id="${acc.id}">
            <td class="font-semibold">${acc.name}</td>
            <td class="text-right">
                <input type="number" class="cash-amount-inline" value="${acc.amount || 0}" data-cash-id="${acc.id}">
            </td>
            <td class="text-center">
                <button class="btn-delete-cash-acc" data-cash-id="${acc.id}" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer;">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
    lucide.createIcons();
    
    tbody.querySelectorAll(".cash-amount-inline").forEach(input => {
        input.addEventListener("change", function() {
            const id = this.getAttribute("data-cash-id");
            const val = parseFloat(this.value) || 0;
            const acc = AppState.cashAccounts.find(a => a.id === id);
            if (acc) {
                acc.amount = val;
                saveState();
                renderCashAccounts();
                updateUI(true);
                updateCharts();
            }
        });
    });
    
    tbody.querySelectorAll(".btn-delete-cash-acc").forEach(btn => {
        btn.addEventListener("click", function() {
            const id = this.getAttribute("data-cash-id");
            if (AppState.cashAccounts.length <= 1) {
                alert("최소 하나의 현금 계좌는 유지해야 합니다.");
                return;
            }
            if (confirm("이 현금 계좌를 삭제하시겠습니까?")) {
                AppState.cashAccounts = AppState.cashAccounts.filter(a => a.id !== id);
                saveState();
                renderCashAccounts();
                updateUI(true);
                updateCharts();
            }
        });
    });
}

// 8. Update UI (Render UI)
function updateUI(skipCompute = false) {
    // 1. 대시보드 통계를 위한 전체 계좌 통산 연산 (모든 마켓)
    const overallResult = computeHoldingsAndRealized('all', 'all');
    const overallStocks = overallResult.stocks;
    
    // 1-2. 해외주식 양도소득세를 위한 실현손익 연산 (해외주식만)
    const overseasResult = computeHoldingsAndRealized('all', 'US');
    const totalRealizedProfitKRW = overseasResult.realizedProfitKRW;
    
    // 2. 현재 선택된 계좌 + 마켓 필터 기준 테이블 렌더링 연산
    const displayResult = computeHoldingsAndRealized(currentAccountFilter, currentMarketFilter);
    AppState.stocks = displayResult.stocks;
    
    // Always sort active stocks
    sortStocksInternal();

    // Toggle Add form button visibility depending on market filter
    const btnShowStockForm = document.getElementById("btn-show-stock-form");
    const btnShowTradeForm = document.getElementById("btn-show-trade-form");
    const stockFormWrapper = document.getElementById("stock-form-wrapper");
    const tradeFormWrapper = document.getElementById("trade-form-wrapper");
    if (currentMarketFilter === 'all') {
        if (btnShowStockForm) btnShowStockForm.style.display = "none";
        if (btnShowTradeForm) btnShowTradeForm.style.display = "none";
        if (stockFormWrapper) stockFormWrapper.style.display = "none";
        if (tradeFormWrapper) tradeFormWrapper.style.display = "none";
    } else {
        if (btnShowStockForm) btnShowStockForm.style.display = "inline-flex";
        if (btnShowTradeForm) btnShowTradeForm.style.display = "inline-flex";
    }

    // A. Update Sorting Headers Indicators
    const cols = ['ticker', 'sector', 'buy-price', 'qty', 'buy-cost', 'current-price', 'eval-price', 'profit-price', 'yield'];
    cols.forEach(c => {
        const el = document.getElementById(`th-${c}`);
        if (el) {
            const icon = el.querySelector(".sort-icon");
            if (icon) {
                let mappedCol = c;
                if (c === 'buy-price') mappedCol = 'buyPrice';
                else if (c === 'buy-cost') mappedCol = 'buyCost';
                else if (c === 'current-price') mappedCol = 'currentPrice';
                else if (c === 'eval-price') mappedCol = 'eval';
                else if (c === 'profit-price') mappedCol = 'profit';
                
                if (sortCol === mappedCol) {
                    icon.innerText = sortAsc ? " ▲" : " ▼";
                } else {
                    icon.innerText = "";
                }
            }
        }
    });

    // B. Stock portfolio rendering
    let totalStockCostKRW = 0;
    let totalStockEvalKRW = 0;
    
    // 대시보드 통산용 자산 규모 계산 (전체 계좌 기준)
    overallStocks.forEach(stock => {
        const costKRW = stock.buyPrice * stock.qty;
        const currentPriceKRW = stock.currentPriceUSD * AppState.exchangeRate;
        const evalKRW = currentPriceKRW * stock.qty;
        totalStockCostKRW += costKRW;
        totalStockEvalKRW += evalKRW;
    });
    
    const stockListBody = document.getElementById("stock-list-tbody");
    stockListBody.innerHTML = "";
    
    AppState.stocks.forEach(stock => {
        const costKRW = stock.buyPrice * stock.qty;
        const currentPriceKRW = stock.currentPriceUSD * AppState.exchangeRate;
        const evalKRW = currentPriceKRW * stock.qty;
        const profitKRW = evalKRW - costKRW;
        const profitPercent = costKRW > 0 ? (profitKRW / costKRW) * 100 : 0;
        
        // Animation class checking
        let flashClass = "";
        if (lastStockPrices[stock.id]) {
            if (stock.currentPriceUSD > lastStockPrices[stock.id]) {
                flashClass = "flash-green";
            } else if (stock.currentPriceUSD < lastStockPrices[stock.id]) {
                flashClass = "flash-red";
            }
        }
        lastStockPrices[stock.id] = stock.currentPriceUSD;
        
        const marketLabel = stock.market === 'KR'
            ? `<span style="background: rgba(244,63,94,0.12); color: var(--color-coral); padding: 0.05rem 0.25rem; border-radius: 4px; font-size: 0.6rem; font-weight: 700; margin-left: 0.35rem; vertical-align: middle;">국내</span>`
            : `<span style="background: rgba(99,102,241,0.12); color: #a5b4fc; padding: 0.05rem 0.25rem; border-radius: 4px; font-size: 0.6rem; font-weight: 700; margin-left: 0.35rem; vertical-align: middle;">해외</span>`;

        // Render Row
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>
                <div class="stock-name-cell">
                    <span class="name">${stock.name}</span>
                    <span class="ticker" style="display: flex; align-items: center;">
                        <span>${stock.ticker}</span>
                        ${marketLabel}
                    </span>
                </div>
            </td>
            <td>
                <input type="text" class="sector-inline-edit" data-ticker="${stock.ticker}"
                       value="${stock.sector || '기타'}"
                       style="background: rgba(168,85,247,0.1); color: #d8b4fe; border: 1px solid rgba(168,85,247,0.15); border-radius: 6px; padding: 0.15rem 0.4rem; font-size: 0.7rem; font-family: Outfit; width: 70px; text-align: center; outline: none;">
            </td>
            <td class="text-right font-family-outfit font-semibold">${Math.round(stock.buyPrice).toLocaleString()}</td>
            <td class="text-right font-family-outfit font-semibold">${parseFloat(stock.qty).toLocaleString()}</td>
            <td class="text-right font-family-outfit font-semibold">${Math.round(costKRW).toLocaleString()}</td>
            <td class="text-right font-family-outfit font-semibold ${flashClass}">${Math.round(currentPriceKRW).toLocaleString()}</td>
            <td class="text-right font-family-outfit font-semibold">${Math.round(evalKRW).toLocaleString()}</td>
            <td class="text-right font-family-outfit font-semibold ${profitKRW >= 0 ? 'text-emerald' : 'text-coral'}">
                ${profitKRW >= 0 ? '+' : ''}${Math.round(profitKRW).toLocaleString()}
            </td>
            <td class="text-right font-family-outfit font-bold ${profitPercent >= 0 ? 'text-emerald' : 'text-coral'}">
                ${formatPercent(profitPercent)}
            </td>
            <td class="text-center">
                <button class="btn-delete-row" data-id="${stock.id}">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            </td>
        `;
        
        if (flashClass) {
            setTimeout(() => {
                const tdCell = tr.querySelector(`.${flashClass}`);
                if (tdCell) tdCell.classList.remove(flashClass);
            }, 1200);
        }
        
        stockListBody.appendChild(tr);
    });
    
    // Calculate and display table totals in footer
    let displayTotalCostKRW = 0;
    let displayTotalEvalKRW = 0;
    
    AppState.stocks.forEach(stock => {
        const costKRW = stock.buyPrice * stock.qty;
        const currentPriceKRW = stock.currentPriceUSD * AppState.exchangeRate;
        const evalKRW = currentPriceKRW * stock.qty;
        displayTotalCostKRW += costKRW;
        displayTotalEvalKRW += evalKRW;
    });
    
    const displayTotalProfitKRW = displayTotalEvalKRW - displayTotalCostKRW;
    const displayTotalYield = displayTotalCostKRW > 0 ? (displayTotalProfitKRW / displayTotalCostKRW) * 100 : 0;
    
    const totalBuyCostEl = document.getElementById("stock-total-buy-cost");
    const totalEvalCostEl = document.getElementById("stock-total-eval-cost");
    const totalProfitEl = document.getElementById("stock-total-profit");
    const totalYieldEl = document.getElementById("stock-total-yield");
    
    if (totalBuyCostEl) totalBuyCostEl.innerText = formatKRW(displayTotalCostKRW);
    if (totalEvalCostEl) totalEvalCostEl.innerText = formatKRW(displayTotalEvalKRW);
    if (totalProfitEl) {
        totalProfitEl.innerText = (displayTotalProfitKRW >= 0 ? '+' : '') + formatKRW(displayTotalProfitKRW);
        totalProfitEl.className = "text-right font-family-outfit font-semibold " + (displayTotalProfitKRW >= 0 ? 'text-emerald' : 'text-coral');
    }
    if (totalYieldEl) {
        totalYieldEl.innerText = formatPercent(displayTotalYield);
        totalYieldEl.className = "text-right font-family-outfit font-bold " + (displayTotalYield >= 0 ? 'text-emerald' : 'text-coral');
    }
    
    // Add Row Delete Handlers (deletes all trades of this ticker for current account)
    document.querySelectorAll(".btn-delete-row").forEach(btn => {
        btn.addEventListener("click", function() {
            const id = this.getAttribute("data-id");
            const stock = AppState.stocks.find(s => s.id === id);
            if (stock) {
                const confirmMsg = currentAccountFilter === 'all'
                    ? `${stock.ticker} 종목의 모든 매매 기록을 삭제하시겠습니까?`
                    : `주식계좌 ${currentAccountFilter}에서 ${stock.ticker} 종목의 매매 기록만 삭제하시겠습니까?`;
                
                if (confirm(confirmMsg)) {
                    if (currentAccountFilter === 'all') {
                        AppState.realizedTrades = AppState.realizedTrades.filter(t => t.ticker !== stock.ticker || (t.market || 'US') !== currentMarketFilter);
                    } else {
                        AppState.realizedTrades = AppState.realizedTrades.filter(t => t.ticker !== stock.ticker || (t.account || '1') !== currentAccountFilter || (t.market || 'US') !== currentMarketFilter);
                    }
                    saveState();
                    updateUI();
                    updateCharts();
                }
            }
        });
    });

    // Sector Inline Edit Handlers
    document.querySelectorAll(".sector-inline-edit").forEach(input => {
        input.addEventListener("change", function() {
            const ticker = this.getAttribute("data-ticker");
            const newSector = this.value.trim() || "기타";
            
            // Update all trades for this ticker
            (AppState.realizedTrades || []).forEach(t => {
                if (t.ticker === ticker) {
                    t.sector = newSector;
                }
            });
            
            // Update STOCK_DATABASE
            if (STOCK_DATABASE[ticker]) {
                STOCK_DATABASE[ticker].sector = newSector;
            }
            
            // Update in-memory stocks for immediate chart reflection
            (AppState.stocks || []).forEach(s => {
                if (s.ticker === ticker) {
                    s.sector = newSector;
                }
            });
            
            saveState();
            updateCharts();
        });
    });
    
    // C. Render Trades (Closed Trades)
    const realizedListBody = document.getElementById("trade-list-tbody");
    realizedListBody.innerHTML = "";
    
    const displayTrades = (AppState.realizedTrades || []).filter(t => 
        (currentAccountFilter === 'all' || (t.account || '1') === currentAccountFilter) &&
        (currentMarketFilter === 'all' || (t.market || 'US') === currentMarketFilter)
    );
    
    displayTrades.forEach(trade => {
        const tr = document.createElement("tr");
        const typeBadge = trade.type === 'buy'
            ? `<span class="tax-badge" style="background:rgba(16,185,129,0.1); color:var(--color-emerald); border-color:rgba(16,185,129,0.15)">매수</span>`
            : `<span class="tax-badge danger" style="background:rgba(244,63,94,0.1); color:var(--color-coral); border-color:rgba(244,63,94,0.15)">매도</span>`;
        
        const totalCostUSD = trade.qty * trade.price;
        const marketBadge = trade.market === 'KR'
            ? `<span style="background: rgba(244,63,94,0.12); color: var(--color-coral); padding: 0.05rem 0.25rem; border-radius: 4px; font-size: 0.6rem; font-weight: 700; margin-left: 0.35rem; vertical-align: middle;">국내</span>`
            : `<span style="background: rgba(99,102,241,0.12); color: #a5b4fc; padding: 0.05rem 0.25rem; border-radius: 4px; font-size: 0.6rem; font-weight: 700; margin-left: 0.35rem; vertical-align: middle;">해외</span>`;
        
        tr.innerHTML = `
            <td class="font-family-outfit text-secondary">${trade.date}</td>
            <td>${typeBadge}</td>
            <td>
                <div style="display: flex; align-items: center;">
                    <span class="ticker-badge">${trade.ticker}</span>
                    ${marketBadge}
                </div>
            </td>
            <td class="text-right font-family-outfit font-semibold">${parseFloat(trade.qty).toLocaleString()}</td>
            <td class="text-right font-family-outfit">${formatUSD(trade.price)}</td>
            <td class="text-right font-family-outfit font-semibold">${formatUSD(totalCostUSD)}</td>
            <td class="text-center">
                <button class="btn-delete-row-trade" data-id="${trade.id}">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            </td>
        `;
        realizedListBody.appendChild(tr);
    });

    // Delete Handlers for Closed Trades
    document.querySelectorAll(".btn-delete-row-trade").forEach(btn => {
        btn.addEventListener("click", function() {
            const id = this.getAttribute("data-id");
            AppState.realizedTrades = AppState.realizedTrades.filter(t => t.id !== id);
            saveState();
            updateUI();
            updateCharts();
        });
    });

    // D. Overseas Stock Tax (양도소득세)
    const historicalTotal = (AppState.historicalProfitEntries || []).reduce((s, e) => s + e.amount, 0);
    let taxBase = (totalRealizedProfitKRW + historicalTotal) - 2500000;
    let estimatedTax = 0;
    if (taxBase > 0) {
        estimatedTax = taxBase * 0.22;
        document.getElementById("tax-alert-badge").innerText = "과세 대상";
        document.getElementById("tax-alert-badge").className = "tax-badge danger";
    } else {
        document.getElementById("tax-alert-badge").innerText = "면세 대상";
        document.getElementById("tax-alert-badge").className = "tax-badge";
    }
    
    document.getElementById("tax-profit-val").innerText = formatKRW(totalRealizedProfitKRW + historicalTotal);
    document.getElementById("tax-due-val").innerText = formatKRW(estimatedTax);
    
    // D-2. Render Real Estate (Tab 3)
    let totalRealEstateCostKRW = 0;
    let totalRealEstateEvalKRW = 0;
    const reListBody = document.getElementById("real-estate-list-tbody");
    
    if (reListBody) {
        reListBody.innerHTML = "";
        (AppState.realEstate || []).forEach(re => {
            const costKRW = re.buyPrice;
            const evalKRW = re.currentPrice;
            const profitKRW = evalKRW - costKRW;
            const profitPercent = costKRW > 0 ? (profitKRW / costKRW) * 100 : 0;
            
            totalRealEstateCostKRW += costKRW;
            totalRealEstateEvalKRW += evalKRW;
            
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="font-semibold">${re.name}</td>
                <td class="text-right font-family-outfit font-semibold">${Math.round(costKRW).toLocaleString()}</td>
                <td class="text-right font-family-outfit font-semibold">${Math.round(evalKRW).toLocaleString()}</td>
                <td class="text-right font-family-outfit font-semibold ${profitKRW >= 0 ? 'text-emerald' : 'text-coral'}">
                    ${profitKRW >= 0 ? '+' : ''}${Math.round(profitKRW).toLocaleString()}
                </td>
                <td class="text-right font-family-outfit font-bold ${profitPercent >= 0 ? 'text-emerald' : 'text-coral'}">
                    ${formatPercent(profitPercent)}
                </td>
                <td class="text-center">
                    <button class="btn-edit-row-re" data-id="${re.id}" style="margin-right: 4px; background: transparent; border: none; color: var(--text-secondary); cursor: pointer;">
                        <i data-lucide="edit-2" style="width: 14px; height: 14px;"></i>
                    </button>
                    <button class="btn-delete-row-re" data-id="${re.id}">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                </td>
            `;
            reListBody.appendChild(tr);
        });

        // Add Delete Handlers for Real Estate
        document.querySelectorAll(".btn-delete-row-re").forEach(btn => {
            btn.addEventListener("click", function() {
                const id = this.getAttribute("data-id");
                if (editingRealEstateId === id) {
                    editingRealEstateId = null;
                    const reFormWrapper = document.getElementById("re-form-wrapper");
                    const reAddForm = document.getElementById("re-add-form");
                    const btnShowReForm = document.getElementById("btn-show-re-form");
                    reFormWrapper.style.display = "none";
                    btnShowReForm.innerHTML = `<i data-lucide="plus"></i> 부동산 자산 추가`;
                    reAddForm.querySelector('button[type="submit"]').innerText = "추가";
                    reAddForm.querySelector('button[type="submit"]').className = "btn btn-emerald btn-sm";
                }
                AppState.realEstate = AppState.realEstate.filter(r => r.id !== id);
                saveState();
                updateUI();
                updateCharts();
            });
        });

        // Add Edit Handlers for Real Estate
        document.querySelectorAll(".btn-edit-row-re").forEach(btn => {
            btn.addEventListener("click", function() {
                const id = this.getAttribute("data-id");
                const re = AppState.realEstate.find(r => r.id === id);
                if (re) {
                    editingRealEstateId = id;
                    document.getElementById("re-name").value = re.name;
                    document.getElementById("re-buy-price").value = re.buyPrice;
                    document.getElementById("re-current-price").value = re.currentPrice;
                    
                    const reFormWrapper = document.getElementById("re-form-wrapper");
                    const reAddForm = document.getElementById("re-add-form");
                    const btnShowReForm = document.getElementById("btn-show-re-form");
                    reFormWrapper.style.display = "block";
                    btnShowReForm.innerHTML = `<i data-lucide="minus"></i> 수정 취소`;
                    reAddForm.querySelector('button[type="submit"]').innerText = "수정 완료";
                    reAddForm.querySelector('button[type="submit"]').className = "btn btn-amber btn-sm";
                    lucide.createIcons();
                }
            });
        });
    }

    // D-3. Render Debts (Tab 4)
    let totalDebtsKRW = 0;
    const debtsListBody = document.getElementById("debts-list-tbody");
    
    if (debtsListBody) {
        debtsListBody.innerHTML = "";
        (AppState.debts || []).forEach(debt => {
            totalDebtsKRW += debt.amount;
            
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="font-semibold">${debt.name}</td>
                <td class="text-right font-family-outfit font-semibold">${Math.round(debt.amount).toLocaleString()}</td>
                <td class="text-right font-family-outfit">${debt.interest ? debt.interest.toFixed(2) + '%' : '-'}</td>
                <td class="text-center">
                    <button class="btn-edit-row-debt" data-id="${debt.id}" style="margin-right: 4px; background: transparent; border: none; color: var(--text-secondary); cursor: pointer;">
                        <i data-lucide="edit-2" style="width: 14px; height: 14px;"></i>
                    </button>
                    <button class="btn-delete-row-debt" data-id="${debt.id}">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                </td>
            `;
            debtsListBody.appendChild(tr);
        });

        // Add Delete Handlers for Debts
        document.querySelectorAll(".btn-delete-row-debt").forEach(btn => {
            btn.addEventListener("click", function() {
                const id = this.getAttribute("data-id");
                if (editingDebtId === id) {
                    editingDebtId = null;
                    const debtFormWrapper = document.getElementById("debt-form-wrapper");
                    const debtAddForm = document.getElementById("debt-add-form");
                    const btnShowDebtForm = document.getElementById("btn-show-debt-form");
                    debtFormWrapper.style.display = "none";
                    btnShowDebtForm.innerHTML = `<i data-lucide="plus"></i> 부채 추가`;
                    debtAddForm.querySelector('button[type="submit"]').innerText = "추가";
                    debtAddForm.querySelector('button[type="submit"]').className = "btn btn-emerald btn-sm";
                }
                AppState.debts = AppState.debts.filter(d => d.id !== id);
                saveState();
                updateUI();
                updateCharts();
            });
        });

        // Add Edit Handlers for Debts
        document.querySelectorAll(".btn-edit-row-debt").forEach(btn => {
            btn.addEventListener("click", function() {
                const id = this.getAttribute("data-id");
                const debt = AppState.debts.find(d => d.id === id);
                if (debt) {
                    editingDebtId = id;
                    document.getElementById("debt-name").value = debt.name;
                    document.getElementById("debt-amount").value = debt.amount;
                    document.getElementById("debt-interest").value = debt.interest || "";
                    
                    const debtFormWrapper = document.getElementById("debt-form-wrapper");
                    const debtAddForm = document.getElementById("debt-add-form");
                    const btnShowDebtForm = document.getElementById("btn-show-debt-form");
                    debtFormWrapper.style.display = "block";
                    btnShowDebtForm.innerHTML = `<i data-lucide="minus"></i> 수정 취소`;
                    debtAddForm.querySelector('button[type="submit"]').innerText = "수정 완료";
                    debtAddForm.querySelector('button[type="submit"]').className = "btn btn-amber btn-sm";
                    lucide.createIcons();
                }
            });
        });
    }

    // E. Asset Summary Calculations
    const cashTotalKRW = getCashTotal();
    const cashUSDKRW = 0;
    const totalGrossAssetVal = cashTotalKRW + totalStockEvalKRW + totalRealEstateEvalKRW;
    const totalAssetVal = totalGrossAssetVal - totalDebtsKRW;
    const totalInvestmentCostKRW = totalStockCostKRW + totalRealEstateCostKRW;
    const totalInvestmentEvalKRW = totalStockEvalKRW + totalRealEstateEvalKRW;
    const totalInvestmentProfitKRW = totalInvestmentEvalKRW - totalInvestmentCostKRW;
    const totalInvestmentReturnPercent = totalInvestmentCostKRW > 0 ? (totalInvestmentProfitKRW / totalInvestmentCostKRW) * 100 : 0;
    
    document.getElementById("total-asset-val").innerText = formatKRW(totalAssetVal);
    document.getElementById("cash-krw-val").innerText = formatKRW(cashTotalKRW);
    document.getElementById("stocks-krw-val").innerText = formatKRW(totalStockEvalKRW);
    document.getElementById("real-estate-krw-val").innerText = formatKRW(totalRealEstateEvalKRW);
    
    // 현금 탭 총액 업데이트
    const cashTabTotalEl = document.getElementById("cash-tab-total-val");
    if (cashTabTotalEl) cashTabTotalEl.innerText = formatKRW(cashTotalKRW);
    
    // 추가된 부채 및 총자산 엘리먼트 갱신
    const debtsKrwValEl = document.getElementById("debts-krw-val");
    if (debtsKrwValEl) debtsKrwValEl.innerText = formatKRW(totalDebtsKRW);
    const totalGrossAssetValEl = document.getElementById("total-gross-asset-val");
    if (totalGrossAssetValEl) totalGrossAssetValEl.innerText = formatKRW(totalGrossAssetVal);
    
    const returnValEl = document.getElementById("total-return-val");
    if (totalInvestmentProfitKRW >= 0) {
        returnValEl.innerText = `+${formatKRW(totalInvestmentProfitKRW)} (${formatPercent(totalInvestmentReturnPercent)})`;
        returnValEl.className = "change-value text-emerald";
    } else {
        returnValEl.innerText = `${formatKRW(totalInvestmentProfitKRW)} (${formatPercent(totalInvestmentReturnPercent)})`;
        returnValEl.className = "change-value text-coral";
    }
    
    // F. Weekly Budget Control
    const curDate = new Date();
    const dayOfWeek = curDate.getDay();
    const diff = curDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
    const monday = new Date(curDate.setDate(diff));
    monday.setHours(0,0,0,0);
    
    let weeklyExpenseKRW = 0;
    AppState.transactions.forEach(tx => {
        const txDate = new Date(tx.date);
        txDate.setHours(0,0,0,0);
        if (tx.type === "expense" && txDate >= monday) {
            weeklyExpenseKRW += tx.amountKRW;
        }
    });
    
    document.getElementById("budget-spent-val").innerText = formatKRW(weeklyExpenseKRW);
    document.getElementById("budget-limit-val").innerText = formatKRW(AppState.weeklyBudget);
    
    let budgetProgressPercent = AppState.weeklyBudget > 0 ? (weeklyExpenseKRW / AppState.weeklyBudget) * 100 : 0;
    const progressFill = document.getElementById("budget-progress-fill");
    const budgetPercentText = document.getElementById("budget-percent-val");
    const budgetStatusText = document.getElementById("budget-status-text");
    
    progressFill.style.width = Math.min(budgetProgressPercent, 100) + "%";
    budgetPercentText.innerText = Math.round(budgetProgressPercent) + "%";
    
    if (budgetProgressPercent >= 100) {
        progressFill.classList.add("warning");
        budgetPercentText.className = "budget-percent text-coral";
        budgetStatusText.innerText = "경고! 이번 주 소비 목표 예산을 초과하였습니다.";
        budgetStatusText.className = "text-coral";
    } else if (budgetProgressPercent >= 80) {
        progressFill.classList.add("warning");
        budgetPercentText.className = "budget-percent text-amber";
        budgetStatusText.innerText = "주의! 이번 주 예산 소진율이 80%에 도달했습니다.";
        budgetStatusText.className = "text-amber";
    } else {
        progressFill.classList.remove("warning");
        budgetPercentText.className = "budget-percent text-indigo";
        budgetStatusText.innerText = "안정적인 지출 수준을 유지 중입니다.";
        budgetStatusText.className = "text-emerald";
    }
    
    // G. Ledger Transactions rendering (filtered by period)
    const ledgerListBody = document.getElementById("ledger-list-tbody");
    ledgerListBody.innerHTML = "";
    
    const periodLabel = document.getElementById("ledger-period-label");
    let filteredTxs = [];
    let periodStart, periodEnd;
    
    if (ledgerViewMode === 'monthly') {
        const y = ledgerCurrentDate.getFullYear();
        const m = ledgerCurrentDate.getMonth();
        periodStart = new Date(y, m, 1);
        periodEnd = new Date(y, m + 1, 0, 23, 59, 59);
        if (periodLabel) periodLabel.innerText = `${y}년 ${m + 1}월`;
    } else {
        const d = new Date(ledgerCurrentDate);
        const day = d.getDay();
        const diffToMon = d.getDate() - day + (day === 0 ? -6 : 1);
        periodStart = new Date(d.getFullYear(), d.getMonth(), diffToMon);
        periodStart.setHours(0, 0, 0, 0);
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + 6);
        periodEnd.setHours(23, 59, 59);
        const weekMonth = periodStart.getMonth() + 1;
        const weekNum = Math.ceil(periodStart.getDate() / 7);
        if (periodLabel) periodLabel.innerText = `${periodStart.getFullYear()}년 ${weekMonth}월 ${weekNum}주차`;
    }
    
    filteredTxs = AppState.transactions.filter(tx => {
        const txDate = new Date(tx.date);
        return txDate >= periodStart && txDate <= periodEnd;
    });
    
    let sumIncome = 0, sumExpense = 0;
    filteredTxs.forEach(tx => {
        if (tx.type === 'income') sumIncome += tx.amountKRW;
        else if (tx.type === 'expense') sumExpense += tx.amountKRW;
    });
    const sumIncomeEl = document.getElementById("ledger-sum-income");
    const sumExpenseEl = document.getElementById("ledger-sum-expense");
    if (sumIncomeEl) sumIncomeEl.innerText = formatKRW(sumIncome);
    if (sumExpenseEl) sumExpenseEl.innerText = formatKRW(sumExpense);
    
    filteredTxs.forEach(tx => {
        const tr = document.createElement("tr");
        let typeBadge = "";
        let amountText = "";
        
        if (tx.type === "income") {
            typeBadge = `<span class="tax-badge" style="background:rgba(16,185,129,0.1); color:var(--color-emerald); border-color:rgba(16,185,129,0.15)">수입</span>`;
            amountText = `<span class="text-emerald font-semibold">+${tx.currency === "KRW" ? formatKRW(tx.amount) : formatUSD(tx.amount)}</span>`;
        } else if (tx.type === "expense") {
            typeBadge = `<span class="tax-badge danger" style="background:rgba(244,63,94,0.1); color:var(--color-coral); border-color:rgba(244,63,94,0.15)">지출</span>`;
            amountText = `<span class="text-coral font-semibold">-${tx.currency === "KRW" ? formatKRW(tx.amount) : formatUSD(tx.amount)}</span>`;
        } else if (tx.type === "invest-in") {
            typeBadge = `<span class="tax-badge" style="background:rgba(99,102,241,0.1); color:var(--color-indigo); border-color:rgba(99,102,241,0.15)">투자</span>`;
            amountText = `<span class="text-indigo font-semibold">${tx.currency === "KRW" ? formatKRW(tx.amount) : formatUSD(tx.amount)}</span>`;
        }
        
        tr.innerHTML = `
            <td class="font-family-outfit text-secondary">${tx.date}</td>
            <td>${typeBadge}</td>
            <td class="font-semibold">${tx.category}</td>
            <td>${tx.desc}</td>
            <td class="text-right font-family-outfit">${amountText}</td>
            <td class="text-center">
                <button class="btn-delete-row-tx" data-id="${tx.id}">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            </td>
        `;
        ledgerListBody.appendChild(tr);
    });
    
    // Add Transaction Delete Handlers
    document.querySelectorAll(".btn-delete-row-tx").forEach(btn => {
        btn.addEventListener("click", function() {
            const id = this.getAttribute("data-id");
            const tx = AppState.transactions.find(t => t.id === id);
            if (tx && AppState.cashAccounts && AppState.cashAccounts[0]) {
                if (tx.type === "income") {
                    AppState.cashAccounts[0].amount -= tx.amountKRW;
                } else if (tx.type === "expense") {
                    AppState.cashAccounts[0].amount += tx.amountKRW;
                } else if (tx.type === "invest-in") {
                    AppState.cashAccounts[0].amount += tx.amountKRW;
                }
            }
            AppState.transactions = AppState.transactions.filter(t => t.id !== id);
            saveState();
            renderCashAccounts();
            updateUI();
            updateCharts();
        });
    });
    
    lucide.createIcons();
}

// 9. Setup Event Listeners
function setupEventListeners() {
    // Exchange Rate Input
    document.getElementById("exchange-rate-input").addEventListener("change", function(e) {
        let val = parseFloat(e.target.value);
        if (isNaN(val) || val <= 0) {
            val = 1350;
            e.target.value = val;
        }
        AppState.exchangeRate = val;
        saveState();
        updateUI();
        updateCharts();
    });

    // (Tax entry add is handled via btn-add-tax-entry in setupEventListeners)

    // Reset Data
    document.getElementById("btn-reset-data").addEventListener("click", function() {
        if (confirm("경고! 모든 입력 데이터가 초기화되고 기본 상태로 복원됩니다. 계속하시겠습니까?")) {
            AppState = JSON.parse(JSON.stringify(DEFAULT_STATE));
            saveState();
            document.getElementById("exchange-rate-input").value = AppState.exchangeRate;
            document.getElementById("budget-limit-val").innerText = formatKRW(AppState.weeklyBudget);
            document.getElementById("budget-limit-input").value = AppState.weeklyBudget;
            updateUI();
            updateCharts();
        }
    });

    // Budget Modal Control Listeners
    const btnEditBudget = document.getElementById("btn-edit-budget");
    const budgetModal = document.getElementById("budget-modal");
    const btnCloseBudgetModal = document.getElementById("btn-close-budget-modal");
    const btnCancelBudgetModal = document.getElementById("btn-cancel-budget-modal");
    const btnSaveBudgetModal = document.getElementById("btn-save-budget-modal");
    const budgetLimitInput = document.getElementById("budget-limit-input");

    btnEditBudget.addEventListener("click", () => {
        budgetLimitInput.value = AppState.weeklyBudget;
        budgetModal.style.display = "flex";
    });

    const closeBudgetModal = () => {
        budgetModal.style.display = "none";
    };

    btnCloseBudgetModal.addEventListener("click", closeBudgetModal);
    btnCancelBudgetModal.addEventListener("click", closeBudgetModal);
    budgetModal.addEventListener("click", (e) => {
        if (e.target === budgetModal) {
            closeBudgetModal();
        }
    });

    btnSaveBudgetModal.addEventListener("click", () => {
        const val = parseInt(budgetLimitInput.value);
        if (!isNaN(val) && val > 0) {
            AppState.weeklyBudget = val;
            saveState();
            updateUI();
            updateCharts();
        }
        closeBudgetModal();
    });

    // Stock Form Toggles
    const btnShowStockForm = document.getElementById("btn-show-stock-form");
    const stockFormWrapper = document.getElementById("stock-form-wrapper");
    btnShowStockForm.addEventListener("click", () => {
        if (stockFormWrapper.style.display === "none") {
            stockFormWrapper.style.display = "block";
            btnShowStockForm.innerHTML = `<i data-lucide="minus"></i> 폼 닫기`;
        } else {
            stockFormWrapper.style.display = "none";
            btnShowStockForm.innerHTML = `<i data-lucide="plus"></i> 보유 주식 추가`;
        }
        lucide.createIcons();
    });
    
    document.getElementById("btn-cancel-stock").addEventListener("click", () => {
        stockFormWrapper.style.display = "none";
        btnShowStockForm.innerHTML = `<i data-lucide="plus"></i> 보유 주식 추가`;
        lucide.createIcons();
    });

    // Stock Add Form Submit (Autocomplete ticker search integrated)
    document.getElementById("stock-add-form").addEventListener("submit", async function(e) {
        e.preventDefault();
        const submitBtn = this.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = "조회 중...";

        const rawTicker = document.getElementById("stock-ticker").value.trim();
        const qty = parseFloat(document.getElementById("stock-qty").value);
        const buyPriceKRW = parseFloat(document.getElementById("stock-buy-price").value);
        
        if (!rawTicker || isNaN(qty) || isNaN(buyPriceKRW)) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
            return;
        }

        const resolved = await resolveTicker(rawTicker, currentMarketFilter);
        const ticker = resolved ? resolved.symbol : rawTicker.toUpperCase();
        const name = resolved ? resolved.name : ticker;
        
        // Always KRW input — convert to USD for internal storage
        const buyPriceUSD = buyPriceKRW / AppState.exchangeRate;
        
        const sectorInput = document.getElementById("stock-sector").value.trim();
        const sector = sectorInput || (STOCK_DATABASE[ticker] ? STOCK_DATABASE[ticker].sector : "기타");
        
        if (!STOCK_DATABASE[ticker]) {
            STOCK_DATABASE[ticker] = { name: name, basePrice: buyPriceUSD, sector: sector };
        } else if (sectorInput) {
            STOCK_DATABASE[ticker].sector = sector;
        }
        
        const account = document.getElementById("stock-account").value;
        
        const newTrade = {
            id: "tr_" + Date.now(),
            date: getOffsetDate(0),
            type: 'buy',
            ticker,
            qty,
            price: buyPriceUSD,
            account,
            sector,
            market: currentMarketFilter
        };
        
        if (!AppState.realizedTrades) AppState.realizedTrades = [];
        AppState.realizedTrades.push(newTrade);
        
        saveState();
        this.reset();
        stockFormWrapper.style.display = "none";
        btnShowStockForm.innerHTML = `<i data-lucide="plus"></i> 보유 주식 추가`;
        lucide.createIcons();
        
        // Refresh prices in background
        fetchLiveStockPrices();
        
        updateUI();
        updateCharts();

        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    });

    // Ledger Form Toggles
    const btnShowLedgerForm = document.getElementById("btn-show-ledger-form");
    const ledgerFormWrapper = document.getElementById("ledger-form-wrapper");
    document.getElementById("ledger-date").value = getOffsetDate(0);

    btnShowLedgerForm.addEventListener("click", () => {
        if (ledgerFormWrapper.style.display === "none") {
            ledgerFormWrapper.style.display = "block";
            btnShowLedgerForm.innerHTML = `<i data-lucide="minus"></i> 폼 닫기`;
        } else {
            ledgerFormWrapper.style.display = "none";
            btnShowLedgerForm.innerHTML = `<i data-lucide="plus"></i> 수입/지출 입력`;
        }
        lucide.createIcons();
    });
    
    document.getElementById("btn-cancel-ledger").addEventListener("click", () => {
        ledgerFormWrapper.style.display = "none";
        btnShowLedgerForm.innerHTML = `<i data-lucide="plus"></i> 수입/지출 입력`;
        lucide.createIcons();
    });

    // Dynamically adjust categories based on transaction type selection
    document.getElementById("ledger-type").addEventListener("change", function(e) {
        const catSelect = document.getElementById("ledger-category");
        catSelect.innerHTML = "";
        
        if (e.target.value === "expense") {
            catSelect.innerHTML = `
                <option value="식비">식비</option>
                <option value="교통">교통</option>
                <option value="주거/공과금">주거/공과금</option>
                <option value="쇼핑/패션">쇼핑/패션</option>
                <option value="문화/여가">문화/여가</option>
                <option value="기타 지출">기타 지출</option>
            `;
        } else if (e.target.value === "income") {
            catSelect.innerHTML = `
                <option value="급여">급여</option>
                <option value="투자수익">투자수익</option>
                <option value="당근마켓/부업">당근마켓/부업</option>
                <option value="기타 수입">기타 수입</option>
            `;
        } else if (e.target.value === "invest-in") {
            catSelect.innerHTML = `
                <option value="주식 매수">주식 매수</option>
                <option value="외화 예치">외화 예치</option>
            `;
        }
    });

    // Ledger Add Form Submit
    document.getElementById("ledger-add-form").addEventListener("submit", function(e) {
        e.preventDefault();
        const date = document.getElementById("ledger-date").value;
        const type = document.getElementById("ledger-type").value;
        const category = document.getElementById("ledger-category").value;
        const amount = parseFloat(document.getElementById("ledger-amount").value);
        const currency = document.getElementById("ledger-currency").value;
        const desc = document.getElementById("ledger-desc").value.trim() || category;
        
        if (isNaN(amount) || amount <= 0) return;
        
        let amountKRW = 0;
        let amountUSD = 0;
        
        if (currency === "KRW") {
            amountKRW = amount;
            amountUSD = amount / AppState.exchangeRate;
        } else {
            amountUSD = amount;
            amountKRW = amount * AppState.exchangeRate;
        }
        
        if (type === "income") {
            if (AppState.cashAccounts && AppState.cashAccounts[0]) AppState.cashAccounts[0].amount += amountKRW;
        } else if (type === "expense") {
            if (AppState.cashAccounts && AppState.cashAccounts[0]) AppState.cashAccounts[0].amount -= amountKRW;
        } else if (type === "invest-in") {
            if (AppState.cashAccounts && AppState.cashAccounts[0]) AppState.cashAccounts[0].amount -= amountKRW;
        }
        
        const newTx = {
            id: "t_" + Date.now(),
            date,
            type,
            category,
            amount: currency === "KRW" ? amountKRW : amountUSD,
            currency,
            amountKRW,
            amountUSD,
            desc
        };
        
        AppState.transactions.unshift(newTx);
        
        saveState();
        this.reset();
        document.getElementById("ledger-date").value = getOffsetDate(0);
        ledgerFormWrapper.style.display = "none";
        btnShowLedgerForm.innerHTML = `<i data-lucide="plus"></i> 수입/지출 입력`;
        lucide.createIcons();
        
        updateUI();
        updateCharts();
    });

    // Portfolio Tab Switching (Holdings vs Trades)
    const portTabHoldings = document.getElementById("btn-port-tab-holdings");
    const portTabTrades = document.getElementById("btn-port-tab-trades");
    const portHoldingsSection = document.getElementById("portfolio-holdings-section");
    const portTradesSection = document.getElementById("portfolio-trades-section");
    
    if (portTabHoldings && portTabTrades) {
        portTabHoldings.addEventListener("click", () => {
            portTabHoldings.classList.add("active");
            portTabTrades.classList.remove("active");
            if (portHoldingsSection) portHoldingsSection.style.display = "block";
            if (portTradesSection) portTradesSection.style.display = "none";
        });
        
        portTabTrades.addEventListener("click", () => {
            portTabHoldings.classList.remove("active");
            portTabTrades.classList.add("active");
            if (portHoldingsSection) portHoldingsSection.style.display = "none";
            if (portTradesSection) portTradesSection.style.display = "block";
        });
    }

    // Market Tabs Switching (Overseas vs Domestic vs All)
    const btnMarketOverseas = document.getElementById("btn-market-tab-overseas");
    const btnMarketDomestic = document.getElementById("btn-market-tab-domestic");
    const btnMarketAll = document.getElementById("btn-market-tab-all");
    
    const updateMarketTabClasses = (activeBtn) => {
        [btnMarketOverseas, btnMarketDomestic, btnMarketAll].forEach(btn => {
            if (btn) {
                if (btn === activeBtn) btn.classList.add("active");
                else btn.classList.remove("active");
            }
        });
    };

    if (btnMarketOverseas) {
        btnMarketOverseas.addEventListener("click", () => {
            currentMarketFilter = 'US';
            updateMarketTabClasses(btnMarketOverseas);
            
            // Update trade form price label & placeholder
            const priceLabel = document.getElementById("trade-price-label");
            const priceInput = document.getElementById("trade-price");
            if (priceLabel) priceLabel.innerHTML = `단가 (USD $) <span class="required">*</span>`;
            if (priceInput) {
                priceInput.placeholder = "0.00";
                priceInput.min = "0.01";
            }
            
            // Update ticker input placeholders
            const stockTickerInput = document.getElementById("stock-ticker");
            const tradeTickerInput = document.getElementById("trade-ticker");
            if (stockTickerInput) stockTickerInput.placeholder = "예: AAPL, TSLA";
            if (tradeTickerInput) tradeTickerInput.placeholder = "예: AAPL, TSLA";
            
            updateUI();
        });
    }
    
    if (btnMarketDomestic) {
        btnMarketDomestic.addEventListener("click", () => {
            currentMarketFilter = 'KR';
            updateMarketTabClasses(btnMarketDomestic);
            
            // Update trade form price label & placeholder
            const priceLabel = document.getElementById("trade-price-label");
            const priceInput = document.getElementById("trade-price");
            if (priceLabel) priceLabel.innerHTML = `단가 (₩) <span class="required">*</span>`;
            if (priceInput) {
                priceInput.placeholder = "0";
                priceInput.min = "1";
            }
            
            // Update ticker input placeholders
            const stockTickerInput = document.getElementById("stock-ticker");
            const tradeTickerInput = document.getElementById("trade-ticker");
            if (stockTickerInput) stockTickerInput.placeholder = "예: 삼성전자, 005930";
            if (tradeTickerInput) tradeTickerInput.placeholder = "예: 삼성전자, 005930";
            
            updateUI();
        });
    }

    if (btnMarketAll) {
        btnMarketAll.addEventListener("click", () => {
            currentMarketFilter = 'all';
            updateMarketTabClasses(btnMarketAll);
            
            // Update ticker input placeholders
            const stockTickerInput = document.getElementById("stock-ticker");
            const tradeTickerInput = document.getElementById("trade-ticker");
            if (stockTickerInput) stockTickerInput.placeholder = "예: AAPL, 005930";
            if (tradeTickerInput) tradeTickerInput.placeholder = "예: AAPL, 005930";
            
            updateUI();
        });
    }

    // Mega Main Tab Switching
    const mainTabs = [
        { btn: "btn-main-tab-stocks", panel: "main-tab-panel-stocks" },
        { btn: "btn-main-tab-cash", panel: "main-tab-panel-cash" },
        { btn: "btn-main-tab-real-estate", panel: "main-tab-panel-real-estate" },
        { btn: "btn-main-tab-ledger", panel: "main-tab-panel-ledger" },
        { btn: "btn-main-tab-debts", panel: "main-tab-panel-debts" }
    ];

    mainTabs.forEach(tab => {
        const btnEl = document.getElementById(tab.btn);
        if (btnEl) {
            btnEl.addEventListener("click", () => {
                mainTabs.forEach(t => {
                    const b = document.getElementById(t.btn);
                    const p = document.getElementById(t.panel);
                    if (b) b.classList.remove("active");
                    if (p) p.style.display = "none";
                });
                btnEl.classList.add("active");
                const panelEl = document.getElementById(tab.panel);
                if (panelEl) panelEl.style.display = "block";
            });
        }
    });

    // Account Manager toggle
    const btnToggleAccManager = document.getElementById("btn-toggle-acc-manager");
    const accManagerWrapper = document.getElementById("acc-manager-wrapper");
    if (btnToggleAccManager && accManagerWrapper) {
        btnToggleAccManager.addEventListener("click", () => {
            if (accManagerWrapper.style.display === "none") {
                accManagerWrapper.style.display = "block";
                btnToggleAccManager.innerHTML = `<i data-lucide="settings" style="width:12px; height:12px;"></i> 관리 닫기`;
            } else {
                accManagerWrapper.style.display = "none";
                btnToggleAccManager.innerHTML = `<i data-lucide="settings" style="width:12px; height:12px;"></i> 계좌 관리`;
            }
            lucide.createIcons();
        });
    }

    // Add New Account button click
    const btnAddNewAccount = document.getElementById("btn-add-new-account");
    if (btnAddNewAccount) {
        btnAddNewAccount.addEventListener("click", function() {
            const inputEl = document.getElementById("new-acc-name-input");
            const name = inputEl.value.trim();
            if (!name) {
                alert("계좌 이름을 입력해 주세요.");
                return;
            }
            const newAccId = "acc_" + Date.now();
            if (!AppState.accounts) AppState.accounts = [];
            AppState.accounts.push({ id: newAccId, name: name });
            saveState();
            inputEl.value = "";
            renderAccountFilters();
            renderAccountSelectors();
            renderAccountManager();
        });
    }

    // Cash Adjustment - removed (now handled by inline edits in renderCashAccounts)

    // Donut chart view select dropdown listener
    const donutViewSelect = document.getElementById("donut-view-select");
    if (donutViewSelect) {
        donutViewSelect.addEventListener("change", function(e) {
            currentDonutView = e.target.value;
            updateCharts();
        });
    }

    // Trade Add Form Toggles
    const btnShowTradeForm = document.getElementById("btn-show-trade-form");
    const tradeFormWrapper = document.getElementById("trade-form-wrapper");
    document.getElementById("trade-date").value = getOffsetDate(0);

    btnShowTradeForm.addEventListener("click", () => {
        if (tradeFormWrapper.style.display === "none") {
            tradeFormWrapper.style.display = "block";
            btnShowTradeForm.innerHTML = `<i data-lucide="minus"></i> 폼 닫기`;
        } else {
            tradeFormWrapper.style.display = "none";
            btnShowTradeForm.innerHTML = `<i data-lucide="plus"></i> 매매 기록 추가`;
        }
        lucide.createIcons();
    });
    
    document.getElementById("btn-cancel-trade").addEventListener("click", () => {
        tradeFormWrapper.style.display = "none";
        btnShowTradeForm.innerHTML = `<i data-lucide="plus"></i> 매매 기록 추가`;
        lucide.createIcons();
    });

    // Trade Add Form Submit (Autocomplete ticker search integrated)
    document.getElementById("trade-add-form").addEventListener("submit", async function(e) {
        e.preventDefault();
        const submitBtn = this.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = "조회 중...";

        const type = document.getElementById("trade-type").value;
        const date = document.getElementById("trade-date").value;
        const rawTicker = document.getElementById("trade-ticker").value.trim();
        const qty = parseFloat(document.getElementById("trade-qty").value);
        const price = parseFloat(document.getElementById("trade-price").value);
        
        if (!rawTicker || isNaN(qty) || isNaN(price)) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
            return;
        }

        const resolved = await resolveTicker(rawTicker, currentMarketFilter);
        const ticker = resolved ? resolved.symbol : rawTicker.toUpperCase();
        const name = resolved ? resolved.name : ticker;

        // If market is KR, convert raw KRW price input to USD for internal storage
        const priceUSD = currentMarketFilter === 'KR' ? price / AppState.exchangeRate : price;

        const sectorInput = document.getElementById("trade-sector").value.trim();
        const sector = sectorInput || (STOCK_DATABASE[ticker] ? STOCK_DATABASE[ticker].sector : "기타");

        if (!STOCK_DATABASE[ticker]) {
            STOCK_DATABASE[ticker] = { name: name, basePrice: priceUSD, sector: sector };
        } else if (sectorInput) {
            STOCK_DATABASE[ticker].sector = sector;
        }
        
        const account = document.getElementById("trade-account").value;
        
        const newTrade = {
            id: "tr_" + Date.now(),
            date,
            type,
            ticker,
            qty,
            price: priceUSD,
            account,
            sector,
            market: currentMarketFilter
        };
        
        if (!AppState.realizedTrades) AppState.realizedTrades = [];
        AppState.realizedTrades.push(newTrade);
        
        saveState();
        this.reset();
        document.getElementById("trade-date").value = getOffsetDate(0);
        tradeFormWrapper.style.display = "none";
        btnShowTradeForm.innerHTML = `<i data-lucide="plus"></i> 매매 기록 추가`;
        lucide.createIcons();
        
        fetchLiveStockPrices();
        
        updateUI();
        updateCharts();

        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    });

    // Real Estate Form Toggles & Submit
    const btnShowReForm = document.getElementById("btn-show-re-form");
    const reFormWrapper = document.getElementById("re-form-wrapper");
    const reAddForm = document.getElementById("re-add-form");
    
    if (btnShowReForm) {
        btnShowReForm.addEventListener("click", () => {
            if (reFormWrapper.style.display === "none") {
                reFormWrapper.style.display = "block";
                btnShowReForm.innerHTML = `<i data-lucide="minus"></i> 폼 닫기`;
            } else {
                reFormWrapper.style.display = "none";
                if (editingRealEstateId) {
                    editingRealEstateId = null;
                    if (reAddForm) {
                        reAddForm.reset();
                        reAddForm.querySelector('button[type="submit"]').innerText = "추가";
                        reAddForm.querySelector('button[type="submit"]').className = "btn btn-emerald btn-sm";
                    }
                }
                btnShowReForm.innerHTML = `<i data-lucide="plus"></i> 부동산 자산 추가`;
            }
            lucide.createIcons();
        });
    }
    
    const btnCancelRe = document.getElementById("btn-cancel-re");
    if (btnCancelRe) {
        btnCancelRe.addEventListener("click", () => {
            reFormWrapper.style.display = "none";
            if (editingRealEstateId) {
                editingRealEstateId = null;
                if (reAddForm) {
                    reAddForm.reset();
                    reAddForm.querySelector('button[type="submit"]').innerText = "추가";
                    reAddForm.querySelector('button[type="submit"]').className = "btn btn-emerald btn-sm";
                }
            }
            btnShowReForm.innerHTML = `<i data-lucide="plus"></i> 부동산 자산 추가`;
            lucide.createIcons();
        });
    }

    if (reAddForm) {
        reAddForm.addEventListener("submit", function(e) {
            e.preventDefault();
            const name = document.getElementById("re-name").value.trim();
            const buyPrice = parseFloat(document.getElementById("re-buy-price").value);
            const currentPrice = parseFloat(document.getElementById("re-current-price").value);
            
            if (!name || isNaN(buyPrice) || isNaN(currentPrice)) return;
            
            if (editingRealEstateId) {
                const reIndex = AppState.realEstate.findIndex(r => r.id === editingRealEstateId);
                if (reIndex > -1) {
                    AppState.realEstate[reIndex].name = name;
                    AppState.realEstate[reIndex].buyPrice = buyPrice;
                    AppState.realEstate[reIndex].currentPrice = currentPrice;
                }
                editingRealEstateId = null;
                reAddForm.querySelector('button[type="submit"]').innerText = "추가";
                reAddForm.querySelector('button[type="submit"]').className = "btn btn-emerald btn-sm";
            } else {
                const newRe = {
                    id: "re_" + Date.now(),
                    name,
                    buyPrice,
                    currentPrice
                };
                if (!AppState.realEstate) AppState.realEstate = [];
                AppState.realEstate.push(newRe);
            }
            
            saveState();
            this.reset();
            reFormWrapper.style.display = "none";
            btnShowReForm.innerHTML = `<i data-lucide="plus"></i> 부동산 자산 추가`;
            lucide.createIcons();
            
            updateUI();
            updateCharts();
        });
    }

    // Debts Form Toggles & Submit
    const btnShowDebtForm = document.getElementById("btn-show-debt-form");
    const debtFormWrapper = document.getElementById("debt-form-wrapper");
    const debtAddForm = document.getElementById("debt-add-form");
    
    if (btnShowDebtForm) {
        btnShowDebtForm.addEventListener("click", () => {
            if (debtFormWrapper.style.display === "none") {
                debtFormWrapper.style.display = "block";
                btnShowDebtForm.innerHTML = `<i data-lucide="minus"></i> 폼 닫기`;
            } else {
                debtFormWrapper.style.display = "none";
                if (editingDebtId) {
                    editingDebtId = null;
                    if (debtAddForm) {
                        debtAddForm.reset();
                        debtAddForm.querySelector('button[type="submit"]').innerText = "추가";
                        debtAddForm.querySelector('button[type="submit"]').className = "btn btn-emerald btn-sm";
                    }
                }
                btnShowDebtForm.innerHTML = `<i data-lucide="plus"></i> 부채 추가`;
            }
            lucide.createIcons();
        });
    }
    
    const btnCancelDebt = document.getElementById("btn-cancel-debt");
    if (btnCancelDebt) {
        btnCancelDebt.addEventListener("click", () => {
            debtFormWrapper.style.display = "none";
            if (editingDebtId) {
                editingDebtId = null;
                if (debtAddForm) {
                    debtAddForm.reset();
                    debtAddForm.querySelector('button[type="submit"]').innerText = "추가";
                    debtAddForm.querySelector('button[type="submit"]').className = "btn btn-emerald btn-sm";
                }
            }
            btnShowDebtForm.innerHTML = `<i data-lucide="plus"></i> 부채 추가`;
            lucide.createIcons();
        });
    }

    if (debtAddForm) {
        debtAddForm.addEventListener("submit", function(e) {
            e.preventDefault();
            const name = document.getElementById("debt-name").value.trim();
            const amount = parseFloat(document.getElementById("debt-amount").value);
            const interestInput = document.getElementById("debt-interest").value;
            const interest = interestInput ? parseFloat(interestInput) : null;
            
            if (!name || isNaN(amount)) return;
            
            if (editingDebtId) {
                const dIndex = AppState.debts.findIndex(d => d.id === editingDebtId);
                if (dIndex > -1) {
                    AppState.debts[dIndex].name = name;
                    AppState.debts[dIndex].amount = amount;
                    AppState.debts[dIndex].interest = interest;
                }
                editingDebtId = null;
                debtAddForm.querySelector('button[type="submit"]').innerText = "추가";
                debtAddForm.querySelector('button[type="submit"]').className = "btn btn-emerald btn-sm";
            } else {
                const newDebt = {
                    id: "debt_" + Date.now(),
                    name,
                    amount,
                    interest
                };
                if (!AppState.debts) AppState.debts = [];
                AppState.debts.push(newDebt);
            }
            
            saveState();
            this.reset();
            debtFormWrapper.style.display = "none";
            btnShowDebtForm.innerHTML = `<i data-lucide="plus"></i> 부채 추가`;
            lucide.createIcons();
            
            updateUI();
            updateCharts();
        });
    }

    // RAW Data Bulk Importer/Exporter Setup
    let activeRawTab = "stocks";
    
    const rawTabStocks = document.getElementById("btn-raw-tab-stocks");
    const rawTabRealized = document.getElementById("btn-raw-tab-realized");
    const rawTabTxs = document.getElementById("btn-raw-tab-txs");
    const rawTabJson = document.getElementById("btn-raw-tab-json");
    
    const rawDataLabel = document.getElementById("raw-data-label");
    const rawDataTextarea = document.getElementById("raw-data-textarea");
    const rawDataHelp = document.getElementById("raw-data-help");
    
    const updateRawTab = (tab) => {
        activeRawTab = tab;
        rawTabStocks.classList.remove("active");
        rawTabRealized.classList.remove("active");
        rawTabTxs.classList.remove("active");
        rawTabJson.classList.remove("active");
        
        if (tab === "stocks") {
            rawTabStocks.classList.add("active");
            rawDataLabel.innerText = "보유 주식 데이터 입력 (티커, 수량, 매수단가)";
            rawDataTextarea.placeholder = "예시:\nAAPL,15,220000\nTSLA,25,265000\nNVDA,8,850000";
            rawDataHelp.innerText = "* 한 줄에 하나씩 [티커, 수량, 매수단가] 형식으로 입력해 주세요. (쉼표 또는 공백으로 구분)";
        } else if (tab === "realized") {
            rawTabRealized.classList.add("active");
            rawDataLabel.innerText = "매매 기록 데이터 입력 (매도일자, 티커, 수량, 매수단가$, 매도단가$)";
            rawDataTextarea.placeholder = "예시:\n2026-05-20,AAPL,10,180.50,195.20\n2026-05-22,TSLA,20,175.00,165.50";
            rawDataHelp.innerText = "* 한 줄에 하나씩 [매도일자, 티커, 수량, 매수단가(USD), 매도단가(USD)] 형식으로 입력해 주세요.";
        } else if (tab === "txs") {
            rawTabTxs.classList.add("active");
            rawDataLabel.innerText = "가계부 내역 데이터 입력 (날짜, 구분, 카테고리, 상세내역, 금액, 통화)";
            rawDataTextarea.placeholder = "예시:\n2026-05-26,지출,식비,점심 식사,12000,KRW\n2026-05-26,수입,급여,보너스,500000,KRW\n2026-05-26,투자,외화 예치,환전 이체,1000,USD";
            rawDataHelp.innerText = "* 한 줄에 하나씩 [날짜, 구분(수입/지출/투자), 카테고리, 상세내역, 금액, 통화(KRW/USD)] 형식으로 입력해 주세요.";
        } else if (tab === "json") {
            rawTabJson.classList.add("active");
            rawDataLabel.innerText = "전체 상태 데이터 (JSON 백업/복원)";
            rawDataTextarea.placeholder = "여기에 백업용 JSON 데이터를 붙여넣거나 추출 버튼을 눌러 복사하세요.";
            rawDataHelp.innerText = "* 앱의 전체 상태(설정, 현금, 주식, 내역 등)를 JSON 형태로 백업하거나 복원합니다.";
        }
        rawDataTextarea.value = "";
    };
    
    rawTabStocks.addEventListener("click", () => updateRawTab("stocks"));
    rawTabRealized.addEventListener("click", () => updateRawTab("realized"));
    rawTabTxs.addEventListener("click", () => updateRawTab("txs"));
    rawTabJson.addEventListener("click", () => updateRawTab("json"));
    
    // EXPORT
    document.getElementById("btn-raw-export").addEventListener("click", () => {
        if (activeRawTab === "stocks") {
            if (AppState.stocks.length === 0) {
                rawDataTextarea.value = "";
                alert("추출할 주식 데이터가 없습니다.");
                return;
            }
            rawDataTextarea.value = AppState.stocks.map(s => `${s.ticker},${s.qty},${s.buyPrice},${s.name}`).join("\n");
        } else if (activeRawTab === "realized") {
            const list = AppState.realizedTrades || [];
            if (list.length === 0) {
                rawDataTextarea.value = "";
                alert("추출할 매매 기록 데이터가 없습니다.");
                return;
            }
            rawDataTextarea.value = list.map(t => `${t.date},${t.ticker},${t.qty},${t.buyPrice || t.price},${t.sellPrice || t.price}`).join("\n");
        } else if (activeRawTab === "txs") {
            if (AppState.transactions.length === 0) {
                rawDataTextarea.value = "";
                alert("추출할 가계부 내역이 없습니다.");
                return;
            }
            rawDataTextarea.value = AppState.transactions.map(t => {
                let typeStr = t.type === 'income' ? '수입' : t.type === 'expense' ? '지출' : '투자';
                return `${t.date},${typeStr},${t.category},${t.desc},${t.amount},${t.currency}`;
            }).join("\n");
        } else if (activeRawTab === "json") {
            rawDataTextarea.value = JSON.stringify(AppState, null, 2);
        }
        alert("데이터가 텍스트 상자에 추출되었습니다. 복사하여 보관하세요!");
    });
    
    // IMPORT
    document.getElementById("btn-raw-import").addEventListener("click", () => {
        const text = rawDataTextarea.value.trim();
        if (!text) {
            alert("입력란이 비어 있습니다. 적용할 데이터를 먼저 입력해 주세요.");
            return;
        }
        
        if (activeRawTab === "json") {
            try {
                const parsed = JSON.parse(text);
                if (typeof parsed.exchangeRate === 'number' && Array.isArray(parsed.stocks) && Array.isArray(parsed.transactions)) {
                    AppState = parsed;
                    if (!AppState.realizedTrades) AppState.realizedTrades = [];
                    AppState.realizedTrades.forEach(t => {
                        if (!t.account) t.account = "1";
                        if (!t.market) {
                            if (/^\d{6}$/.test(t.ticker) || t.ticker.endsWith(".KS") || t.ticker.endsWith(".KQ")) {
                                t.market = 'KR';
                            } else {
                                t.market = 'US';
                            }
                        }
                    });
                    if (!AppState.realEstate) AppState.realEstate = [];
                    if (!AppState.debts) AppState.debts = [];
                    if (!AppState.accounts || AppState.accounts.length === 0) {
                        AppState.accounts = [
                            { id: "1", name: "주식계좌 1" },
                            { id: "2", name: "주식계좌 2" }
                        ];
                    }
                    // Migration
                    if (AppState.cashKRW !== undefined && (!AppState.cashAccounts || AppState.cashAccounts.length === 0)) {
                        AppState.cashAccounts = [{id: "cash_1", name: "현금 계좌 1", amount: AppState.cashKRW || 0}];
                        delete AppState.cashKRW; delete AppState.cashUSD;
                    }
                    if (!AppState.cashAccounts || AppState.cashAccounts.length === 0) AppState.cashAccounts = [{id: "cash_1", name: "현금 계좌 1", amount: 0}];
                    if (AppState.historicalRealizedProfitKRW !== undefined && !AppState.historicalProfitEntries) {
                        if (AppState.historicalRealizedProfitKRW > 0) {
                            AppState.historicalProfitEntries = [{id: "he_migrated", desc: "기존 이전 수익", amount: AppState.historicalRealizedProfitKRW}];
                        } else { AppState.historicalProfitEntries = []; }
                        delete AppState.historicalRealizedProfitKRW;
                    }
                    if (!AppState.historicalProfitEntries) AppState.historicalProfitEntries = [];
                    
                    saveState();
                    renderAccountFilters();
                    renderAccountSelectors();
                    renderAccountManager();
                    renderRawAccountSelector();
                    renderTaxEntries();
                    renderCashAccounts();
                    updateUI();
                    updateCharts();
                    document.getElementById("exchange-rate-input").value = AppState.exchangeRate;
                    document.getElementById("budget-limit-val").innerText = formatKRW(AppState.weeklyBudget);
                    document.getElementById("budget-limit-input").value = AppState.weeklyBudget;
                    alert("JSON 전체 상태 데이터가 정상적으로 복원되었습니다!");
                    rawDataTextarea.value = "";
                } else {
                    alert("올바르지 않은 백업 데이터 포맷입니다.");
                }
            } catch (e) {
                alert("JSON 파싱 오류가 발생했습니다. 데이터를 확인해 주세요.\n" + e.message);
            }
        } else if (activeRawTab === "stocks") {
            const lines = text.split("\n");
            const newStocks = [];
            let errorCount = 0;
            
            lines.forEach((line, idx) => {
                const row = line.trim();
                if (!row) return;
                
                let parts = row.split(",");
                if (parts.length < 3) parts = row.split("\t");
                if (parts.length < 3) parts = row.split(/\s+/);
                
                if (parts.length >= 3) {
                    let ticker = parts[0].trim().toUpperCase();
                    // Auto-append .KS to 6-digit tickers
                    if (/^\d{6}$/.test(ticker)) {
                        ticker = ticker + ".KS";
                    }
                    const qty = parseFloat(parts[1]);
                    const buyPrice = parseFloat(parts[2]);
                    let name = parts[3] ? parts[3].trim() : "";
                    
                    if (ticker && !isNaN(qty) && !isNaN(buyPrice)) {
                        let currentPriceUSD = 100.0;
                        if (STOCK_DATABASE[ticker]) {
                            currentPriceUSD = STOCK_DATABASE[ticker].basePrice;
                            if (!name) name = STOCK_DATABASE[ticker].name;
                        } else {
                            STOCK_DATABASE[ticker] = { name: ticker + " Corp.", basePrice: currentPriceUSD };
                            if (!name) name = ticker + " Corp.";
                        }
                        
                        newStocks.push({
                            id: "s_" + Date.now() + "_" + idx,
                            ticker,
                            name: name || ticker,
                            qty,
                            buyPrice,
                            currentPriceUSD
                        });
                    } else {
                        errorCount++;
                    }
                } else {
                    errorCount++;
                }
            });
            
            if (newStocks.length > 0) {
                let confirmMsg = `현재 주식 목록을 초기화하고, 입력한 ${newStocks.length}개의 주식을 새로 적용하시겠습니까? (오류 행: ${errorCount}개)`;
                if (currentMarketFilter === 'KR') {
                    confirmMsg = `현재 국내주식 목록만 초기화하고, 입력한 ${newStocks.length}개의 주식을 새로 적용하시겠습니까? (해외주식 데이터는 보존됩니다. 오류 행: ${errorCount}개)`;
                } else if (currentMarketFilter === 'US') {
                    confirmMsg = `현재 해외주식 목록만 초기화하고, 입력한 ${newStocks.length}개의 주식을 새로 적용하시겠습니까? (국내주식 데이터는 보존됩니다. 오류 행: ${errorCount}개)`;
                }
                
                if (confirm(confirmMsg)) {
                    const rawAccSel = document.getElementById("raw-acc-select");
                    const selectedAccId = rawAccSel ? rawAccSel.value : ((AppState.accounts && AppState.accounts[0]) ? AppState.accounts[0].id : "1");
                    
                    const newTrades = newStocks.map((s, i) => {
                        const isKR = /^\d{6}$/.test(s.ticker) || s.ticker.endsWith('.KS') || s.ticker.endsWith('.KQ');
                        const market = isKR ? 'KR' : 'US';
                        return {
                            id: "tr_" + Date.now() + "_" + i,
                            date: getOffsetDate(0),
                            type: 'buy',
                            ticker: s.ticker,
                            qty: s.qty,
                            price: market === 'KR' ? s.buyPrice / AppState.exchangeRate : s.buyPrice,
                            account: selectedAccId,
                            market: market
                        };
                    });

                    if (currentMarketFilter === 'KR') {
                        AppState.realizedTrades = (AppState.realizedTrades || []).filter(t => t.market !== 'KR');
                    } else if (currentMarketFilter === 'US') {
                        AppState.realizedTrades = (AppState.realizedTrades || []).filter(t => t.market !== 'US');
                    } else {
                        AppState.realizedTrades = [];
                    }
                    AppState.realizedTrades.push(...newTrades);
                    
                    saveState();
                    fetchLiveStockPrices();
                    updateUI();
                    updateCharts();
                    alert(`성공적으로 ${newStocks.length}개의 보유 주식이 매수 트랜잭션으로 일괄 등록되었습니다!`);
                    rawDataTextarea.value = "";
                }
            } else {
                alert("유효한 주식 데이터가 없습니다. 형식을 확인해 주세요.");
            }
        } else if (activeRawTab === "realized") {
            const lines = text.split("\n");
            const newRealized = [];
            let errorCount = 0;
            
            lines.forEach((line, idx) => {
                const row = line.trim();
                if (!row) return;
                
                let parts = row.split(",");
                if (parts.length < 5) parts = row.split("\t");
                
                if (parts.length >= 5) {
                    const date = parts[0].trim();
                    let ticker = parts[1].trim().toUpperCase();
                    if (/^\d{6}$/.test(ticker)) {
                        ticker = ticker + ".KS";
                    }
                    const qty = parseFloat(parts[2]);
                    const buyPrice = parseFloat(parts[3]);
                    const sellPrice = parseFloat(parts[4]);
                    
                    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                    const finalDate = dateRegex.test(date) ? date : getOffsetDate(0);
                    
                    const rawAccSel2 = document.getElementById("raw-acc-select");
                    const selectedAccId2 = rawAccSel2 ? rawAccSel2.value : ((AppState.accounts && AppState.accounts[0]) ? AppState.accounts[0].id : "1");
                    if (ticker && !isNaN(qty) && !isNaN(buyPrice) && !isNaN(sellPrice)) {
                        const isKR = /^\d{6}$/.test(ticker) || ticker.endsWith('.KS') || ticker.endsWith('.KQ');
                        const finalBuyPrice = isKR ? buyPrice / AppState.exchangeRate : buyPrice;
                        const finalSellPrice = isKR ? sellPrice / AppState.exchangeRate : sellPrice;
                        const market = isKR ? 'KR' : 'US';
                        
                        newRealized.push({
                            id: "tr_b_" + Date.now() + "_" + idx,
                            date: finalDate,
                            type: 'buy',
                            ticker,
                            qty,
                            price: finalBuyPrice,
                            account: selectedAccId2,
                            market: market
                        });
                        newRealized.push({
                            id: "tr_s_" + Date.now() + "_" + idx,
                            date: finalDate,
                            type: 'sell',
                            ticker,
                            qty,
                            price: finalSellPrice,
                            account: selectedAccId2,
                            market: market
                        });
                    } else {
                        errorCount++;
                    }
                } else {
                    errorCount++;
                }
            });
            
            if (newRealized.length > 0) {
                let confirmMsg = `현재 매매 기록 목록을 초기화하고, 입력한 ${newRealized.length / 2}개의 거래 쌍을 매수/매도 내역으로 일괄 등록하시겠습니까?`;
                if (currentMarketFilter === 'KR') {
                    confirmMsg = `현재 국내주식 매매 기록 목록만 초기화하고, 입력한 ${newRealized.length / 2}개의 거래 쌍을 새로 등록하시겠습니까? (해외주식 매매 기록은 보존됩니다.)`;
                } else if (currentMarketFilter === 'US') {
                    confirmMsg = `현재 해외주식 매매 기록 목록만 초기화하고, 입력한 ${newRealized.length / 2}개의 거래 쌍을 새로 등록하시겠습니까? (국내주식 매매 기록은 보존됩니다.)`;
                }
                
                if (confirm(confirmMsg)) {
                    if (currentMarketFilter === 'KR') {
                        AppState.realizedTrades = (AppState.realizedTrades || []).filter(t => t.market !== 'KR');
                    } else if (currentMarketFilter === 'US') {
                        AppState.realizedTrades = (AppState.realizedTrades || []).filter(t => t.market !== 'US');
                    } else {
                        AppState.realizedTrades = [];
                    }
                    AppState.realizedTrades.push(...newRealized);
                    
                    saveState();
                    fetchLiveStockPrices();
                    updateUI();
                    updateCharts();
                    alert(`성공적으로 ${newRealized.length / 2}쌍의 매매 기록이 가져오기 처리되었습니다!`);
                    rawDataTextarea.value = "";
                }
            } else {
                alert("유효한 매매 기록 데이터가 없습니다. 형식을 확인해 주세요.");
            }
        } else if (activeRawTab === "txs") {
            const lines = text.split("\n");
            const newTxs = [];
            let errorCount = 0;
            
            lines.forEach((line, idx) => {
                const row = line.trim();
                if (!row) return;
                
                let parts = row.split(",");
                if (parts.length < 5) parts = row.split("\t");
                
                if (parts.length >= 5) {
                    const date = parts[0].trim();
                    const typeKorean = parts[1].trim();
                    const category = parts[2].trim();
                    const desc = parts[3].trim();
                    const amount = parseFloat(parts[4]);
                    const currency = parts[5] ? parts[5].trim().toUpperCase() : "KRW";
                    
                    let type = 'expense';
                    if (typeKorean === '수입' || typeKorean.toLowerCase() === 'income') type = 'income';
                    else if (typeKorean === '지출' || typeKorean.toLowerCase() === 'expense') type = 'expense';
                    else if (typeKorean === '투자' || typeKorean.toLowerCase() === 'invest-in' || typeKorean.toLowerCase() === 'invest') type = 'invest-in';
                    
                    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                    const finalDate = dateRegex.test(date) ? date : getOffsetDate(0);
                    
                    if (!isNaN(amount) && amount > 0) {
                        let amountKRW = 0;
                        let amountUSD = 0;
                        
                        if (currency === "KRW") {
                            amountKRW = amount;
                            amountUSD = amount / AppState.exchangeRate;
                        } else {
                            amountUSD = amount;
                            amountKRW = amount * AppState.exchangeRate;
                        }
                        
                        newTxs.push({
                            id: "t_" + Date.now() + "_" + idx,
                            date: finalDate,
                            type,
                            category,
                            desc: desc || category,
                            amount,
                            currency,
                            amountKRW,
                            amountUSD
                        });
                    } else {
                        errorCount++;
                    }
                } else {
                    errorCount++;
                }
            });
            
            if (newTxs.length > 0) {
                if (confirm(`현재 가계부 내역과 현금 잔고를 초기화하고, 입력한 ${newTxs.length}개의 내역으로 새로 채우시겠습니까? (오류 행: ${errorCount}개)`)) {
                    AppState.transactions = newTxs;
                    
                    // Reset first cash account balance and recalculate from transactions
                    if (AppState.cashAccounts && AppState.cashAccounts[0]) {
                        AppState.cashAccounts[0].amount = 0;
                    }
                    
                    const sortedTxs = [...newTxs].sort((a, b) => a.date.localeCompare(b.date));
                    sortedTxs.forEach(tx => {
                        if (AppState.cashAccounts && AppState.cashAccounts[0]) {
                            if (tx.type === "income") {
                                AppState.cashAccounts[0].amount += tx.amountKRW;
                            } else if (tx.type === "expense") {
                                AppState.cashAccounts[0].amount -= tx.amountKRW;
                            } else if (tx.type === "invest-in") {
                                AppState.cashAccounts[0].amount -= tx.amountKRW;
                            }
                        }
                    });
                    
                    saveState();
                    renderCashAccounts();
                    updateUI();
                    updateCharts();
                    alert(`성공적으로 ${newTxs.length}개의 가계부 내역이 일괄 등록되었습니다!\n재산출된 현금 잔고: ${formatKRW(getCashTotal())}`);
                    rawDataTextarea.value = "";
                }
            } else {
                alert("유효한 가계부 내역 데이터가 없습니다. 형식을 확인해 주세요.");
            }
        }
    });

    // Table Sorting Headers Event Listeners
    document.getElementById("th-ticker").addEventListener("click", () => sortHoldings("ticker"));
    document.getElementById("th-sector").addEventListener("click", () => sortHoldings("sector"));
    document.getElementById("th-qty").addEventListener("click", () => sortHoldings("qty"));
    document.getElementById("th-buy-price").addEventListener("click", () => sortHoldings("buyPrice"));
    document.getElementById("th-current-price").addEventListener("click", () => sortHoldings("currentPrice"));
    document.getElementById("th-eval-price").addEventListener("click", () => sortHoldings("eval"));
    document.getElementById("th-profit-price").addEventListener("click", () => sortHoldings("profit"));
    document.getElementById("th-buy-cost").addEventListener("click", () => sortHoldings("buyCost"));
    document.getElementById("th-yield").addEventListener("click", () => sortHoldings("yield"));

    // (Note: Stock/Trade account filter buttons are dynamically rendered and bound via renderAccountFilters)

    // Refresh Prices Button
    const btnRefreshPrices = document.getElementById("btn-refresh-prices");
    if (btnRefreshPrices) {
        btnRefreshPrices.addEventListener("click", async function() {
            const spinner = document.getElementById("icon-refresh-spinner");
            if (spinner) spinner.style.animation = "spin 1s linear infinite";
            btnRefreshPrices.disabled = true;
            try {
                await fetchLiveExchangeRate();
                await fetchLiveStockPrices();
            } catch (e) {
                console.error("시세 갱신 실패:", e);
            }
            btnRefreshPrices.disabled = false;
            if (spinner) spinner.style.animation = "";
            simSeconds = 20.0; // 타이머 리셋
        });
    }

    // Tax Entry Add
    const btnAddTaxEntry = document.getElementById("btn-add-tax-entry");
    if (btnAddTaxEntry) {
        btnAddTaxEntry.addEventListener("click", function() {
            const desc = document.getElementById("tax-entry-desc").value.trim() || "이전 수익";
            const amount = parseFloat(document.getElementById("tax-entry-amount").value);
            if (isNaN(amount) || amount === 0) { alert("금액을 입력하세요."); return; }
            if (!AppState.historicalProfitEntries) AppState.historicalProfitEntries = [];
            AppState.historicalProfitEntries.push({ id: "he_" + Date.now(), desc, amount });
            saveState();
            document.getElementById("tax-entry-desc").value = "";
            document.getElementById("tax-entry-amount").value = "";
            renderTaxEntries();
            updateUI(true);
        });
    }

    // Cash Account Add
    const btnAddCashAcc = document.getElementById("btn-add-cash-account");
    const cashAccFormWrapper = document.getElementById("cash-acc-form-wrapper");
    if (btnAddCashAcc && cashAccFormWrapper) {
        btnAddCashAcc.addEventListener("click", () => {
            cashAccFormWrapper.style.display = cashAccFormWrapper.style.display === 'none' ? 'block' : 'none';
        });
    }
    const btnCancelCashAcc = document.getElementById("btn-cancel-cash-acc");
    if (btnCancelCashAcc && cashAccFormWrapper) {
        btnCancelCashAcc.addEventListener("click", () => { cashAccFormWrapper.style.display = 'none'; });
    }
    const btnSaveCashAcc = document.getElementById("btn-save-cash-acc");
    if (btnSaveCashAcc) {
        btnSaveCashAcc.addEventListener("click", function() {
            const name = document.getElementById("cash-acc-name-input").value.trim();
            const amount = parseFloat(document.getElementById("cash-acc-amount-input").value) || 0;
            if (!name) { alert("계좌명을 입력하세요."); return; }
            if (!AppState.cashAccounts) AppState.cashAccounts = [];
            AppState.cashAccounts.push({ id: "cash_" + Date.now(), name, amount });
            saveState();
            document.getElementById("cash-acc-name-input").value = "";
            document.getElementById("cash-acc-amount-input").value = "";
            if (cashAccFormWrapper) cashAccFormWrapper.style.display = 'none';
            renderCashAccounts();
            updateUI(true);
            updateCharts();
        });
    }

    // Ledger View Mode Toggle
    const btnLedgerMonthly = document.getElementById("btn-ledger-monthly");
    const btnLedgerWeekly = document.getElementById("btn-ledger-weekly");
    if (btnLedgerMonthly && btnLedgerWeekly) {
        btnLedgerMonthly.addEventListener("click", () => {
            ledgerViewMode = 'monthly';
            btnLedgerMonthly.classList.add('active');
            btnLedgerWeekly.classList.remove('active');
            updateUI(true); updateCharts();
        });
        btnLedgerWeekly.addEventListener("click", () => {
            ledgerViewMode = 'weekly';
            btnLedgerWeekly.classList.add('active');
            btnLedgerMonthly.classList.remove('active');
            updateUI(true); updateCharts();
        });
    }

    // Ledger Date Navigation
    const btnLedgerPrev = document.getElementById("btn-ledger-prev");
    const btnLedgerNext = document.getElementById("btn-ledger-next");
    if (btnLedgerPrev) {
        btnLedgerPrev.addEventListener("click", () => {
            if (ledgerViewMode === 'monthly') {
                ledgerCurrentDate.setMonth(ledgerCurrentDate.getMonth() - 1);
            } else {
                ledgerCurrentDate.setDate(ledgerCurrentDate.getDate() - 7);
            }
            updateUI(true); updateCharts();
        });
    }
    if (btnLedgerNext) {
        btnLedgerNext.addEventListener("click", () => {
            if (ledgerViewMode === 'monthly') {
                ledgerCurrentDate.setMonth(ledgerCurrentDate.getMonth() + 1);
            } else {
                ledgerCurrentDate.setDate(ledgerCurrentDate.getDate() + 7);
            }
            updateUI(true); updateCharts();
        });
    }
}

// 10. ApexCharts Setup and Initialization
function renderCharts() {
    const commonChartOptions = {
        chart: {
            foreColor: '#64748b',
            toolbar: { show: false },
            background: 'transparent'
        },
        theme: { mode: 'dark' },
        grid: { borderColor: 'rgba(255,255,255,0.05)' },
        colors: ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#f43f5e']
    };

    // A. Portfolio Donut Chart
    const donutOptions = {
        ...commonChartOptions,
        series: [0, 0, 0],
        chart: {
            ...commonChartOptions.chart,
            type: 'donut',
            height: 220
        },
        labels: ['현금', '주식 평가액', '부동산 자산'],
        colors: ['#3b82f6', '#10b981', '#a855f7'],
        dataLabels: { enabled: false },
        legend: {
            position: 'bottom',
            fontSize: '11px',
            fontFamily: 'Outfit, Noto Sans KR'
        },
        plotOptions: {
            pie: {
                donut: {
                    size: '72%',
                    background: 'transparent'
                }
            }
        },
        stroke: { show: false },
        tooltip: {
            fillSeriesColor: false,
            y: {
                formatter: function(val, opts) {
                    const total = opts.globals.seriesTotals.reduce((a, b) => a + b, 0);
                    const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                    return formatKoreanAmount(val) + '(' + pct + '%)';
                }
            }
        }
    };
    
    donutChart = new ApexCharts(document.querySelector("#portfolio-donut-chart"), donutOptions);
    donutChart.render();

    // B. Budget vs Actual Combo Chart (Monthly Flow)
    const comboOptions = {
        ...commonChartOptions,
        series: [{
            name: '목표 예산',
            type: 'column',
            data: [0, 0, 0, 0]
        }, {
            name: '실제 지출',
            type: 'line',
            data: [0, 0, 0, 0]
        }],
        chart: {
            ...commonChartOptions.chart,
            height: 200,
            type: 'line',
            stacked: false
        },
        colors: ['#1e293b', '#f59e0b'],
        stroke: {
            width: [0, 3],
            curve: 'smooth'
        },
        plotOptions: {
            bar: {
                columnWidth: '40%',
                borderRadius: 4
            }
        },
        labels: ['3주 전', '2주 전', '지난 주', '이번 주'],
        xaxis: {
            type: 'category',
            labels: { style: { fontSize: '10px' } }
        },
        yaxis: {
            labels: {
                formatter: function(val) {
                    return Math.round(val / 10000) + "만";
                },
                style: { fontSize: '10px' }
            }
        },
        tooltip: {
            shared: true,
            intersect: false,
            y: {
                formatter: function (y) {
                    if (typeof y !== "undefined") {
                        return formatKRW(y);
                    }
                    return y;
                }
            }
        },
        legend: {
            position: 'top',
            fontSize: '10px'
        }
    };

    comboChart = new ApexCharts(document.querySelector("#budget-combo-chart"), comboOptions);
    comboChart.render();

    // C. Asset Growth Trend Area Chart
    const growthOptions = {
        ...commonChartOptions,
        series: [{
            name: '총 자산 규모',
            data: [0, 0, 0, 0, 0, 0]
        }],
        chart: {
            ...commonChartOptions.chart,
            height: 200,
            type: 'area'
        },
        colors: ['#10b981'],
        dataLabels: { enabled: false },
        stroke: {
            curve: 'smooth',
            width: 2
        },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.35,
                opacityTo: 0.02,
                stops: [0, 95]
            }
        },
        xaxis: {
            type: 'category',
            categories: getRecentMonths(6),
            labels: { style: { fontSize: '9px' } }
        },
        yaxis: {
            labels: {
                formatter: function(val) {
                    return Math.round(val / 10000) + "만";
                },
                style: { fontSize: '9px' }
            }
        },
        tooltip: {
            x: { format: 'yyyy-MM' },
            y: {
                formatter: function(val) {
                    return formatKRW(val);
                }
            }
        }
    };

    growthChart = new ApexCharts(document.querySelector("#asset-growth-chart"), growthOptions);
    growthChart.render();

    // D. Ledger Cumulative Spending Chart
    const ledgerCumulOptions = {
        ...commonChartOptions,
        series: [{ name: '누적 지출', data: [] }],
        chart: { ...commonChartOptions.chart, height: 180, type: 'area' },
        colors: ['#f43f5e'],
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 2 },
        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0.02, stops: [0, 95] } },
        xaxis: { type: 'category', categories: [], labels: { style: { fontSize: '9px', colors: '#94a3b8' } } },
        yaxis: { labels: { formatter: function(val) { return Math.round(val / 10000) + '만'; }, style: { fontSize: '9px', colors: '#94a3b8' } } },
        tooltip: { y: { formatter: function(val) { return formatKRW(val); } } }
    };
    ledgerCumulChart = new ApexCharts(document.querySelector("#ledger-cumul-chart"), ledgerCumulOptions);
    ledgerCumulChart.render();
}

function updateCharts() {
    if (!donutChart || !comboChart || !growthChart) return;
    
    // A. Portfolio Donut
    let totalStockEvalKRW = 0;
    AppState.stocks.forEach(stock => {
        totalStockEvalKRW += stock.currentPriceUSD * AppState.exchangeRate * stock.qty;
    });
    
    // Calculate overall stocks eval across all markets for net worth calculations in chart
    let totalStockEvalAllMarkets = 0;
    const allMarketStocksResult = computeHoldingsAndRealized(currentAccountFilter, 'all');
    allMarketStocksResult.stocks.forEach(stock => {
        totalStockEvalAllMarkets += stock.currentPriceUSD * AppState.exchangeRate * stock.qty;
    });
    
    const cashTotalKRW_chart = getCashTotal();
    const cashUSDKRW = 0;
    
    let totalRealEstateEvalKRW = 0;
    (AppState.realEstate || []).forEach(re => {
        totalRealEstateEvalKRW += re.currentPrice;
    });

    let totalDebtsKRW = 0;
    (AppState.debts || []).forEach(debt => {
        totalDebtsKRW += debt.amount;
    });
    
    const totalGrossAssetVal = cashTotalKRW_chart + totalStockEvalAllMarkets + totalRealEstateEvalKRW;
    const totalAssetVal = totalGrossAssetVal - totalDebtsKRW;
    
    if (currentDonutView === 'stocks') {
        const stockTickers = [];
        const stockValues = [];
        
        (AppState.stocks || []).forEach(stock => {
            const evalKRW = stock.currentPriceUSD * AppState.exchangeRate * stock.qty;
            if (evalKRW > 0) {
                stockTickers.push(stock.ticker);
                stockValues.push(evalKRW);
            }
        });
        
        if (stockValues.length === 0) {
            donutChart.updateOptions({
                colors: ['#334155'],
                labels: ['보유 주식 없음']
            });
            donutChart.updateSeries([1]);
        } else {
            const presetColors = ['#10b981', '#3b82f6', '#f59e0b', '#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#14b8a6', '#06b6d4', '#8b5cf6'];
            const colors = stockTickers.map((_, idx) => presetColors[idx % presetColors.length]);
            
            donutChart.updateOptions({
                colors: colors,
                labels: stockTickers
            });
            donutChart.updateSeries(stockValues);
        }
        
        document.getElementById("donut-total-val").innerText = formatKRW(totalStockEvalKRW);
        const labelEl = document.querySelector("#donut-center-info .label");
        if (labelEl) labelEl.innerText = "주식 평가액";
    } else if (currentDonutView === 'sectors') {
        const sectorMap = {};
        (AppState.stocks || []).forEach(stock => {
            const evalKRW = stock.currentPriceUSD * AppState.exchangeRate * stock.qty;
            if (evalKRW > 0) {
                const sec = stock.sector || "기타";
                sectorMap[sec] = (sectorMap[sec] || 0) + evalKRW;
            }
        });
        
        const sectorNames = Object.keys(sectorMap);
        const sectorValues = Object.values(sectorMap);
        
        if (sectorValues.length === 0) {
            donutChart.updateOptions({
                colors: ['#334155'],
                labels: ['보유 주식 없음']
            });
            donutChart.updateSeries([1]);
        } else {
            const presetColors = ['#a855f7', '#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#f43f5e', '#14b8a6', '#06b6d4', '#8b5cf6'];
            const colors = sectorNames.map((_, idx) => presetColors[idx % presetColors.length]);
            
            donutChart.updateOptions({
                colors: colors,
                labels: sectorNames
            });
            donutChart.updateSeries(sectorValues);
        }
        
        document.getElementById("donut-total-val").innerText = formatKRW(totalStockEvalKRW);
        const labelEl = document.querySelector("#donut-center-info .label");
        if (labelEl) labelEl.innerText = "주식 평가액";
    } else {
        if (cashTotalKRW_chart === 0 && totalStockEvalAllMarkets === 0 && totalRealEstateEvalKRW === 0) {
            donutChart.updateOptions({
                colors: ['#334155'],
                labels: ['입력된 자산 없음']
            });
            donutChart.updateSeries([1]);
        } else {
            donutChart.updateOptions({
                colors: ['#3b82f6', '#10b981', '#a855f7'],
                labels: ['현금', '주식 평가액', '부동산 자산']
            });
            donutChart.updateSeries([
                cashTotalKRW_chart,
                totalStockEvalAllMarkets,
                totalRealEstateEvalKRW
            ]);
        }
        
        document.getElementById("donut-total-val").innerText = formatKRW(totalAssetVal);
        const labelEl = document.querySelector("#donut-center-info .label");
        if (labelEl) labelEl.innerText = "순자산";
    }

    // B. Budget vs Actual Combo (Past 4 Weeks)
    const curDate = new Date();
    const budgetList = [AppState.weeklyBudget, AppState.weeklyBudget, AppState.weeklyBudget, AppState.weeklyBudget];
    const spentList = [0, 0, 0, 0];
    
    const weekStartDates = [];
    for (let i = 3; i >= 0; i--) {
        const dayOfWeek = curDate.getDay();
        const diff = curDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1) - (i * 7);
        const wStart = new Date(new Date().setDate(diff));
        wStart.setHours(0,0,0,0);
        weekStartDates.push(wStart);
    }
    
    AppState.transactions.forEach(tx => {
        const txDate = new Date(tx.date);
        txDate.setHours(0,0,0,0);
        
        if (tx.type === "expense") {
            for (let i = 0; i < 4; i++) {
                const wStart = weekStartDates[i];
                const wEnd = new Date(wStart.getTime() + 7 * 24 * 60 * 60 * 1000);
                if (txDate >= wStart && txDate < wEnd) {
                    spentList[i] += tx.amountKRW;
                    break;
                }
            }
        }
    });
    
    comboChart.updateSeries([{
        name: '목표 예산',
        type: 'column',
        data: budgetList
    }, {
        name: '실제 지출',
        type: 'line',
        data: spentList
    }]);

    // C. Asset Growth Trend (Last 6 Months)
    const months = getRecentMonths(6);
    const growthValues = [];
    
    let runningAsset = totalAssetVal;
    
    for (let i = 5; i >= 0; i--) {
        const targetMonth = months[i];
        growthValues[i] = runningAsset;
        
        // 해당 월에 발생한 가계부 내역 집계하여 역산
        let monthTxs = AppState.transactions.filter(t => t.date.substring(0, 7) === targetMonth);
        let monthChange = 0;
        monthTxs.forEach(t => {
            if (t.type === "income") monthChange += t.amountKRW;
            else if (t.type === "expense") monthChange -= t.amountKRW;
        });
        
        const seed = targetMonth + (AppState.stocks.length ? AppState.stocks[0].ticker : "seed");
        const randVal = getSeedRandom(seed);
        let stockFluct = (randVal * 6.0 - 2.5) / 100 * (totalStockEvalKRW + totalRealEstateEvalKRW);
        runningAsset = runningAsset - monthChange - stockFluct;
    }
    
    growthChart.updateOptions({
        xaxis: { categories: months }
    });
    growthChart.updateSeries([{
        name: '총 자산 규모',
        data: growthValues
    }]);

    // D. Ledger Cumulative Spending Chart
    if (ledgerCumulChart) {
        let pStart, pEnd;
        if (ledgerViewMode === 'monthly') {
            const y = ledgerCurrentDate.getFullYear();
            const m = ledgerCurrentDate.getMonth();
            pStart = new Date(y, m, 1);
            pEnd = new Date(y, m + 1, 0);
        } else {
            const d = new Date(ledgerCurrentDate);
            const day = d.getDay();
            const diffToMon = d.getDate() - day + (day === 0 ? -6 : 1);
            pStart = new Date(d.getFullYear(), d.getMonth(), diffToMon);
            pEnd = new Date(pStart);
            pEnd.setDate(pEnd.getDate() + 6);
        }
        
        const dailyExpense = {};
        const cur = new Date(pStart);
        while (cur <= pEnd) {
            dailyExpense[cur.toISOString().split('T')[0]] = 0;
            cur.setDate(cur.getDate() + 1);
        }
        
        AppState.transactions.forEach(tx => {
            if (tx.type === 'expense') {
                const dKey = tx.date;
                if (dailyExpense[dKey] !== undefined) {
                    dailyExpense[dKey] += tx.amountKRW;
                }
            }
        });
        
        const dates = Object.keys(dailyExpense).sort();
        let cumul = 0;
        const cumulData = dates.map(d => {
            cumul += dailyExpense[d];
            return cumul;
        });
        const labels = dates.map(d => d.substring(5));
        
        ledgerCumulChart.updateOptions({ xaxis: { categories: labels } });
        ledgerCumulChart.updateSeries([{ name: '누적 지출', data: cumulData }]);
    }
}
// 11. Live Stock Price and Exchange Rate Simulators
function startStockSimulator() {
    if (simInterval) clearInterval(simInterval);
    simSeconds = 20.0;
    
    simInterval = setInterval(() => {
        simSeconds -= 1.0;
        
        if (simSeconds <= 0) {
            fetchLiveExchangeRate().then(() => {
                fetchLiveStockPrices();
            });
            simSeconds = 20.0;
        }
        
        const timerEl = document.getElementById("simulation-timer");
        if (timerEl) {
            timerEl.innerText = `다음 갱신 ${simSeconds.toFixed(0)}초`;
        }
    }, 1000);
}

async function fetchLiveExchangeRate() {
    try {
        const data = await fetchWithFallback(`https://query1.finance.yahoo.com/v8/finance/chart/KRW=X`);
        const meta = data.chart.result[0].meta;
        
        let rate = meta.regularMarketPrice;
        if (!rate) {
            const indicators = data.chart.result[0].indicators;
            if (indicators && indicators.quote && indicators.quote[0] && indicators.quote[0].close) {
                const closes = indicators.quote[0].close;
                for (let i = closes.length - 1; i >= 0; i--) {
                    if (closes[i] !== null && closes[i] !== undefined) {
                        rate = closes[i];
                        break;
                    }
                }
            }
        }
        if (!rate) {
            rate = meta.chartPreviousClose || meta.previousClose;
        }

        if (rate) {
            AppState.exchangeRate = rate;
            document.getElementById("exchange-rate-input").value = rate.toFixed(1);
            saveState();
        }
    } catch (e) {
        console.error("환율 연동 실패, 기존값 유지:", e);
    }
}

async function fetchLiveStockPrices() {
    const tickers = new Set();
    AppState.stocks.forEach(s => tickers.add(s.ticker));
    if (AppState.realizedTrades) {
        AppState.realizedTrades.forEach(t => tickers.add(t.ticker));
    }
    if (tickers.size === 0) return;
    
    const tickerList = Array.from(tickers);
    
    const promises = tickerList.map(async (ticker) => {
        try {
            const data = await fetchWithFallback(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`);
            const meta = data.chart.result[0].meta;
            
            let price = meta.regularMarketPrice;
            if (!price) {
                const indicators = data.chart.result[0].indicators;
                if (indicators && indicators.quote && indicators.quote[0] && indicators.quote[0].close) {
                    const closes = indicators.quote[0].close;
                    for (let i = closes.length - 1; i >= 0; i--) {
                        if (closes[i] !== null && closes[i] !== undefined) {
                            price = closes[i];
                            break;
                        }
                    }
                }
            }
            if (!price) {
                price = meta.chartPreviousClose || meta.previousClose;
            }

            if (price && meta.currency && meta.currency.toUpperCase() === 'KRW') {
                price = price / AppState.exchangeRate;
            }
            const name = meta.shortName || ticker;
            return { ticker, price, name };
        } catch (e) {
            console.error(`주가 조회 실패 [${ticker}]:`, e);
            return null;
        }
    });
    
    const results = await Promise.all(promises);
    results.forEach(res => {
        if (res && res.price) {
            if (STOCK_DATABASE[res.ticker]) {
                // 기존 sector 등의 정보를 보존하면서 가격과 이름만 업데이트
                STOCK_DATABASE[res.ticker].basePrice = res.price;
                STOCK_DATABASE[res.ticker].name = res.name;
            } else {
                STOCK_DATABASE[res.ticker] = {
                    name: res.name,
                    basePrice: res.price,
                    sector: "기타"
                };
            }
        }
    });
    
    saveState();
    updateUI(true); // Redraw with newly fetched prices, skipping calculation to avoid reset of sorted list
    updateCharts();
}

// 12. Initialize App State
function initApp() {
    const saved = localStorage.getItem("junyoung_asset_ledger_state");
    if (saved) {
        try {
            AppState = JSON.parse(saved);
            if (!AppState.realizedTrades) AppState.realizedTrades = [];
            AppState.realizedTrades.forEach(t => {
                if (!t.account) t.account = "1";
                if (!t.market) {
                    if (/^\d{6}$/.test(t.ticker) || t.ticker.endsWith(".KS") || t.ticker.endsWith(".KQ")) {
                        t.market = 'KR';
                    } else {
                        t.market = 'US';
                    }
                }
            });
            if (!AppState.realEstate) AppState.realEstate = [];
            if (!AppState.debts) AppState.debts = [];
            if (!AppState.accounts || AppState.accounts.length === 0) {
                AppState.accounts = [
                    { id: "1", name: "주식계좌 1" },
                    { id: "2", name: "주식계좌 2" }
                ];
            }
            
            // Migration: cashKRW -> cashAccounts
            if (AppState.cashKRW !== undefined && (!AppState.cashAccounts || AppState.cashAccounts.length === 0)) {
                AppState.cashAccounts = [{id: "cash_1", name: "현금 계좌 1", amount: AppState.cashKRW || 0}];
                delete AppState.cashKRW;
                delete AppState.cashUSD;
            }
            if (!AppState.cashAccounts || AppState.cashAccounts.length === 0) AppState.cashAccounts = [{id: "cash_1", name: "현금 계좌 1", amount: 0}];
            
            // Migration: historicalRealizedProfitKRW -> historicalProfitEntries
            if (AppState.historicalRealizedProfitKRW !== undefined && !AppState.historicalProfitEntries) {
                if (AppState.historicalRealizedProfitKRW > 0) {
                    AppState.historicalProfitEntries = [{id: "he_migrated", desc: "기존 이전 수익", amount: AppState.historicalRealizedProfitKRW}];
                } else {
                    AppState.historicalProfitEntries = [];
                }
                delete AppState.historicalRealizedProfitKRW;
            }
            if (!AppState.historicalProfitEntries) AppState.historicalProfitEntries = [];
            
            saveState();
        } catch (e) {
            console.error("데이터 로드 오류, 초기 상태로 재설정합니다.", e);
            AppState = JSON.parse(JSON.stringify(DEFAULT_STATE));
        }
    } else {
        AppState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
    
    // Bind UI default values
    document.getElementById("exchange-rate-input").value = AppState.exchangeRate;
    document.getElementById("budget-limit-val").innerText = formatKRW(AppState.weeklyBudget);
    document.getElementById("budget-limit-input").value = AppState.weeklyBudget;
    
    // Render dynamic account items
    renderAccountFilters();
    renderAccountSelectors();
    renderAccountManager();
    renderRawAccountSelector();
    renderTaxEntries();
    renderCashAccounts();
    
    // Bind Event Listeners
    setupEventListeners();
    
    // Build Charts
    renderCharts();
    
    // Initial UI Update
    updateUI();
    updateCharts();
    
    // Run live API integrations
    fetchLiveExchangeRate().then(() => {
        fetchLiveStockPrices();
    });
    
    // Start Ticker timer
    startStockSimulator();
}

window.addEventListener("DOMContentLoaded", initApp);
