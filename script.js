/**
 * EletroPromo ML — Sistema Web de Promoções de Materiais Elétricos (Mercado Livre)
 * Arquitetura: Vanilla JS + LocalStorage + Web Share API
 * Segurança: Manipulação segura de DOM (sem innerHTML com dados do usuário e sem eval).
 */

(() => {
  'use strict';

  /* ==========================================================================
     1. CHAVES DE ARMAZENAMENTO E ESTADO PADRÃO
     ========================================================================== */
  const STORAGE_KEYS = {
    PROMOTIONS: 'eletropromo_ml_promotions_v1',
    CATEGORIES: 'eletropromo_ml_categories_v1',
    SHARES: 'eletropromo_ml_shares_v1',
    ACCESS_LOG: 'eletropromo_ml_access_log_v1',
    COUPONS: 'eletropromo_ml_coupons_v1',
    SETTINGS: 'eletropromo_ml_settings_v1'
  };

  const SESSION_FLAG_KEY = 'eletropromo_ml_active_session_id';

  const DEFAULT_CATEGORIES = [
    'Fios e Cabos',
    'Disjuntores',
    'Quadros de Distribuição',
    'Tomadas e Interruptores',
    'Iluminação',
    'Lâmpadas',
    'Conectores',
    'Eletrodutos e Acessórios',
    'Ferramentas Elétricas',
    'DR e DPS',
    'Materiais de Instalação',
    'Outros'
  ];

  const DEFAULT_SETTINGS = {
    systemName: 'EletroPromo ML',
    managerName: 'Equipe Comercial Elétrica',
    shareMode: 'auto', // 'auto' | 'wa_link'
    defaultTemplate: 'padrao',
    loyaltyRules: [
      { id: 'rule_5', discount: 5, requiredDays: 3, periodDays: 7, prefix: 'ELETRICA5' },
      { id: 'rule_10', discount: 10, requiredDays: 7, periodDays: 30, prefix: 'ELETRICA10' },
      { id: 'rule_15', discount: 15, requiredDays: 15, periodDays: 30, prefix: 'ELETRICA15' }
    ]
  };

  let currentModalPromoId = null;

  /* ==========================================================================
     2. UTILITÁRIOS DE ARMAZENAMENTO, FORMATAÇÃO E SEGURANÇA
     ========================================================================== */
  function readStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (error) {
      console.error(`Erro ao ler ${key} do LocalStorage:`, error);
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Erro ao salvar ${key} no LocalStorage:`, error);
      showToast('Erro ao salvar dados no navegador. Verifique o espaço disponível.', 'error');
      return false;
    }
  }

  function generateUUID() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10);
  }

  const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  function formatBRL(value) {
    const num = Number(value) || 0;
    return currencyFormatter.format(num);
  }

  function parseBRLInput(str) {
    if (!str) return 0;
    const digits = String(str).replace(/\D/g, '');
    return digits ? parseInt(digits, 10) / 100 : 0;
  }

  function applyCurrencyMask(inputEl) {
    const numericValue = parseBRLInput(inputEl.value);
    inputEl.value = formatBRL(numericValue);
    return numericValue;
  }

  function formatDateBR(isoDateStr) {
    if (!isoDateStr) return '-';
    const parts = isoDateStr.split('T')[0].split('-');
    if (parts.length !== 3) return isoDateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function formatDateTimeBR(isoStr) {
    if (!isoStr) return '-';
    const date = new Date(isoStr);
    if (isNaN(date.getTime())) return isoStr;
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getLocalISODate(dateObj = new Date()) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function isValidUrl(urlStr) {
    try {
      const url = new URL(urlStr);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  function createEl(tag, options = {}) {
    const el = document.createElement(tag);
    if (options.className) el.className = options.className;
    if (options.text !== undefined) el.textContent = options.text;
    if (options.attrs) {
      Object.entries(options.attrs).forEach(([k, v]) => el.setAttribute(k, v));
    }
    return el;
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = createEl('div', { className: `toast ${type}`, text: message });
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3800);
  }

  /* ==========================================================================
     3. INICIALIZAÇÃO DE DADOS E SESSÃO DE ACESSO
     ========================================================================== */
  function initializeDefaultData() {
    if (!localStorage.getItem(STORAGE_KEYS.CATEGORIES)) {
      writeStorage(STORAGE_KEYS.CATEGORIES, DEFAULT_CATEGORIES);
    }
    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      writeStorage(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.PROMOTIONS)) {
      writeStorage(STORAGE_KEYS.PROMOTIONS, []);
    }
    if (!localStorage.getItem(STORAGE_KEYS.SHARES)) {
      writeStorage(STORAGE_KEYS.SHARES, []);
    }
    if (!localStorage.getItem(STORAGE_KEYS.ACCESS_LOG)) {
      writeStorage(STORAGE_KEYS.ACCESS_LOG, []);
    }
    if (!localStorage.getItem(STORAGE_KEYS.COUPONS)) {
      writeStorage(STORAGE_KEYS.COUPONS, []);
    }
  }

  /**
   * Registra uma nova sessão apenas se não houver sessão ativa na aba atual (sessionStorage),
   * evitando inflar acessos ao pressionar F5 / atualizar a página.
   */
  function registerAccessSession() {
    const existingSession = sessionStorage.getItem(SESSION_FLAG_KEY);
    if (existingSession) return;

    const sessionId = generateUUID();
    sessionStorage.setItem(SESSION_FLAG_KEY, sessionId);

    const now = new Date();
    const accessLog = readStorage(STORAGE_KEYS.ACCESS_LOG, []);
    const deviceType = window.innerWidth <= 768 ? 'Mobile / Tablet' : 'Desktop';

    accessLog.unshift({
      id: sessionId,
      timestamp: now.toISOString(),
      dateKey: getLocalISODate(now),
      device: `${deviceType} (${window.innerWidth}x${window.innerHeight})`
    });

    writeStorage(STORAGE_KEYS.ACCESS_LOG, accessLog);
  }

  /* ==========================================================================
     4. PROGRAMA DE FIDELIDADE E GERAÇÃO AUTOMÁTICA DE CUPONS
     ========================================================================== */
  function getDistinctDaysInWindow(accessLog, periodDays) {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (periodDays - 1));

    const distinctDates = new Set();
    accessLog.forEach((entry) => {
      const entryDate = new Date(entry.timestamp);
      if (entryDate >= cutoff) {
        distinctDates.add(entry.dateKey || getLocalISODate(entryDate));
      }
    });

    return distinctDates.size;
  }

  function evaluateLoyaltyCoupons() {
    const settings = readStorage(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    const accessLog = readStorage(STORAGE_KEYS.ACCESS_LOG, []);
    const coupons = readStorage(STORAGE_KEYS.COUPONS, []);
    const now = new Date();

    // Atualiza cupons expirados
    let updated = false;
    coupons.forEach((c) => {
      if (c.status === 'disponivel' && new Date(c.expiresAt) < now) {
        c.status = 'expirado';
        updated = true;
      }
    });

    let newlyUnlocked = null;

    // Verifica cada regra configurada
    settings.loyaltyRules.forEach((rule) => {
      const distinctCount = getDistinctDaysInWindow(accessLog, rule.periodDays);
      if (distinctCount >= rule.requiredDays) {
        // Verifica se já existe cupom ativo/disponível ou gerado recentemente para esta regra dentro do ciclo
        const cycleCutoff = new Date();
        cycleCutoff.setDate(cycleCutoff.getDate() - rule.periodDays);

        const alreadyGrantedInCycle = coupons.some(
          (c) => c.ruleId === rule.id && new Date(c.createdAt) >= cycleCutoff
        );

        if (!alreadyGrantedInCycle) {
          const suffix = generateUUID().split('-')[0].toUpperCase().slice(0, 4);
          const expires = new Date();
          expires.setDate(expires.getDate() + 15); // Validade de 15 dias

          const newCoupon = {
            id: generateUUID(),
            ruleId: rule.id,
            code: `${rule.prefix}-${suffix}`,
            discount: rule.discount,
            createdAt: now.toISOString(),
            expiresAt: expires.toISOString(),
            status: 'disponivel'
          };

          coupons.unshift(newCoupon);
          newlyUnlocked = newCoupon;
          updated = true;
        }
      }
    });

    if (updated) {
      writeStorage(STORAGE_KEYS.COUPONS, coupons);
    }

    if (newlyUnlocked) {
      showToast(`Cupom desbloqueado: ${newlyUnlocked.code} (${newlyUnlocked.discount}% OFF)!`, 'success');
    }

    return newlyUnlocked;
  }

  /* ==========================================================================
     5. NAVEGAÇÃO ENTRE TELAS E INTERFACE GERAL
     ========================================================================== */
  const VIEW_TITLES = {
    dashboard: 'Dashboard',
    cadastro: 'Cadastrar Promoção',
    gerador: 'Gerador de Mensagens & WhatsApp',
    historico: 'Histórico e Anotações',
    relatorios: 'Relatórios de Acesso',
    fidelidade: 'Programa de Fidelidade',
    configuracoes: 'Configurações do Sistema'
  };

  function navigateTo(viewId) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach((btn) => btn.classList.remove('active'));

    const targetView = document.getElementById(`view-${viewId}`);
    const targetNav = document.querySelector(`.nav-item[data-target="${viewId}"]`);

    if (targetView) targetView.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    document.getElementById('page-title').textContent = VIEW_TITLES[viewId] || 'Painel';

    // Fecha menu mobile se estiver aberto
    closeMobileSidebar();

    // Atualiza dados específicos da tela aberta
    if (viewId === 'dashboard') renderDashboard();
    if (viewId === 'cadastro') populateCategorySelects();
    if (viewId === 'gerador') renderGeneratorOptions();
    if (viewId === 'historico') renderHistoryTable();
    if (viewId === 'relatorios') renderAccessReports();
    if (viewId === 'fidelidade') renderLoyaltyView();
    if (viewId === 'configuracoes') renderSettingsView();
  }

  function openMobileSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('open');
  }

  function closeMobileSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  }

  function applyBrandingHeader() {
    const settings = readStorage(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    document.getElementById('sidebar-system-name').textContent = settings.systemName || 'EletroPromo ML';
    document.getElementById('sidebar-manager-name').textContent = settings.managerName || 'Painel Administrativo';
    document.getElementById('current-date-badge').textContent = new Date().toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  /* ==========================================================================
     6. DASHBOARD INICIAL
     ========================================================================== */
  function renderDashboard() {
    const promotions = readStorage(STORAGE_KEYS.PROMOTIONS, []);
    const shares = readStorage(STORAGE_KEYS.SHARES, []);
    const accessLog = readStorage(STORAGE_KEYS.ACCESS_LOG, []);
    const coupons = readStorage(STORAGE_KEYS.COUPONS, []);
    const settings = readStorage(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);

    const sessions7d = accessLog.filter((item) => {
      const diff = (Date.now() - new Date(item.timestamp).getTime()) / (1000 * 60 * 60 * 24);
      return diff <= 7;
    }).length;

    const distinct7d = getDistinctDaysInWindow(accessLog, 7);
    const availableCoupons = coupons.filter((c) => c.status === 'disponivel');

    document.getElementById('kpi-total-promos').textContent = promotions.length;
    document.getElementById('kpi-total-shares').textContent = shares.length;
    document.getElementById('kpi-total-sessions').textContent = accessLog.length;
    document.getElementById('kpi-7days-sessions').textContent = sessions7d;
    document.getElementById('kpi-distinct-days').textContent = `${distinct7d} dia(s) distinto(s) na semana`;
    document.getElementById('kpi-available-coupons').textContent = availableCoupons.length;

    // Próximo cupom a desbloquear
    const sortedRules = [...settings.loyaltyRules].sort((a, b) => a.discount - b.discount);
    let nextRuleText = 'Todos atingidos!';
    let nextRuleSub = 'Parabéns pela recorrência';

    for (const rule of sortedRules) {
      const currentDistinct = getDistinctDaysInWindow(accessLog, rule.periodDays);
      if (currentDistinct < rule.requiredDays) {
        const missing = rule.requiredDays - currentDistinct;
        nextRuleText = `${rule.discount}% OFF`;
        nextRuleSub = `Falta(m) ${missing} dia(s) distinto(s) em ${rule.periodDays}d`;
        break;
      }
    }

    document.getElementById('kpi-next-coupon').textContent = nextRuleText;
    document.getElementById('kpi-next-coupon-sub').textContent = nextRuleSub;

    // Lista de promoções recentes
    const recentPromosEl = document.getElementById('dash-recent-promos');
    recentPromosEl.innerHTML = '';
    const recentPromos = promotions.slice(0, 5);

    if (recentPromos.length === 0) {
      recentPromosEl.appendChild(createEl('p', { className: 'helper-text', text: 'Nenhuma promoção cadastrada ainda.' }));
    } else {
      recentPromos.forEach((p) => {
        const row = createEl('div', { className: 'list-row' });
        const info = createEl('div');
        info.appendChild(createEl('div', { className: 'list-row-title', text: p.name }));
        info.appendChild(
          createEl('div', {
            className: 'list-row-meta',
            text: `${p.category} • Por ${formatBRL(p.discountPrice)} (-${p.discountPercent}%)`
          })
        );

        const actionBtn = createEl('button', {
          className: 'btn btn-secondary btn-sm',
          text: 'Divulgar'
        });
        actionBtn.addEventListener('click', () => {
          navigateTo('gerador');
          const select = document.getElementById('gen-promo-select');
          select.value = p.id;
          generatePromoMessage();
        });

        row.appendChild(info);
        row.appendChild(actionBtn);
        recentPromosEl.appendChild(row);
      });
    }

    // Lista de últimos acessos
    const recentAccessEl = document.getElementById('dash-recent-access');
    recentAccessEl.innerHTML = '';
    const recentAccess = accessLog.slice(0, 5);

    recentAccess.forEach((acc) => {
      const row = createEl('div', { className: 'list-row' });
      const info = createEl('div');
      info.appendChild(createEl('div', { className: 'list-row-title', text: formatDateTimeBR(acc.timestamp) }));
      info.appendChild(createEl('div', { className: 'list-row-meta', text: acc.device }));
      row.appendChild(info);
      recentAccessEl.appendChild(row);
    });
  }

  /* ==========================================================================
     7. CADASTRO E EDIÇÃO DE PROMOÇÕES
     ========================================================================== */
  function populateCategorySelects() {
    const categories = readStorage(STORAGE_KEYS.CATEGORIES, DEFAULT_CATEGORIES);
    const formSelect = document.getElementById('promo-category');
    const filterSelect = document.getElementById('filter-category');

    const currentFormVal = formSelect.value;
    const currentFilterVal = filterSelect.value;

    formSelect.innerHTML = '';
    filterSelect.innerHTML = '<option value="">Todas as categorias</option>';

    categories.forEach((cat) => {
      formSelect.appendChild(createEl('option', { text: cat, attrs: { value: cat } }));
      filterSelect.appendChild(createEl('option', { text: cat, attrs: { value: cat } }));
    });

    if (currentFormVal && categories.includes(currentFormVal)) formSelect.value = currentFormVal;
    if (currentFilterVal && categories.includes(currentFilterVal)) filterSelect.value = currentFilterVal;
  }

  function updateDiscountCalculation() {
    const orig = parseBRLInput(document.getElementById('promo-original-price').value);
    const promo = parseBRLInput(document.getElementById('promo-discount-price').value);
    const outEl = document.getElementById('promo-discount-percent');

    if (orig > 0 && promo > 0 && promo < orig) {
      const percent = Math.round(((orig - promo) / orig) * 100);
      outEl.value = `${percent}%`;
    } else {
      outEl.value = '0%';
    }
  }

  function resetPromoForm() {
    document.getElementById('promo-form').reset();
    document.getElementById('promo-id').value = '';
    document.getElementById('promo-discount-percent').value = '0%';
    document.getElementById('promo-date').value = getLocalISODate();
    document.getElementById('form-promo-title').textContent = 'Cadastrar Nova Promoção';
    document.getElementById('btn-save-promo').textContent = 'Salvar Promoção';
    document.getElementById('btn-cancel-edit').classList.add('hidden');
  }

  function handlePromoSubmit(event) {
    event.preventDefault();

    const id = document.getElementById('promo-id').value;
    const name = document.getElementById('promo-name').value.trim();
    const category = document.getElementById('promo-category').value;
    const status = document.getElementById('promo-status').value;
    const originalPrice = parseBRLInput(document.getElementById('promo-original-price').value);
    const discountPrice = parseBRLInput(document.getElementById('promo-discount-price').value);
    const promoDate = document.getElementById('promo-date').value;
    const link = document.getElementById('promo-link').value.trim();
    const payment = document.getElementById('promo-payment').value.trim();
    const shipping = document.getElementById('promo-shipping').value.trim();
    const description = document.getElementById('promo-description').value.trim();
    const notes = document.getElementById('promo-notes').value.trim();

    if (!name) {
      showToast('Informe o nome do produto.', 'error');
      return;
    }
    if (originalPrice <= 0 || discountPrice <= 0) {
      showToast('Informe valores válidos para o preço original e promocional.', 'error');
      return;
    }
    if (discountPrice >= originalPrice) {
      showToast('O preço promocional deve ser menor que o preço original.', 'error');
      return;
    }
    if (!promoDate) {
      showToast('Informe a data da promoção/validade.', 'error');
      return;
    }
    if (!isValidUrl(link)) {
      showToast('Informe um link válido começando com http:// ou https://', 'error');
      return;
    }

    const discountPercent = Math.round(((originalPrice - discountPrice) / originalPrice) * 100);
    const promotions = readStorage(STORAGE_KEYS.PROMOTIONS, []);

    if (id) {
      const idx = promotions.findIndex((p) => p.id === id);
      if (idx !== -1) {
        promotions[idx] = {
          ...promotions[idx],
          name,
          category,
          status,
          originalPrice,
          discountPrice,
          discountPercent,
          promoDate,
          link,
          payment,
          shipping,
          description,
          notes,
          updatedAt: new Date().toISOString()
        };
        writeStorage(STORAGE_KEYS.PROMOTIONS, promotions);
        showToast('Promoção atualizada com sucesso!', 'success');
      }
    } else {
      const newPromo = {
        id: generateUUID(),
        name,
        category,
        status,
        originalPrice,
        discountPrice,
        discountPercent,
        promoDate,
        link,
        payment,
        shipping,
        description,
        notes,
        createdAt: new Date().toISOString(),
        generatedMessage: ''
      };
      promotions.unshift(newPromo);
      writeStorage(STORAGE_KEYS.PROMOTIONS, promotions);
      showToast('Promoção cadastrada com sucesso!', 'success');
    }

    resetPromoForm();
    navigateTo('historico');
  }

  function editPromotion(promoId) {
    const promotions = readStorage(STORAGE_KEYS.PROMOTIONS, []);
    const promo = promotions.find((p) => p.id === promoId);
    if (!promo) return;

    navigateTo('cadastro');

    document.getElementById('promo-id').value = promo.id;
    document.getElementById('promo-name').value = promo.name;
    document.getElementById('promo-category').value = promo.category;
    document.getElementById('promo-status').value = promo.status;
    document.getElementById('promo-original-price').value = formatBRL(promo.originalPrice);
    document.getElementById('promo-discount-price').value = formatBRL(promo.discountPrice);
    document.getElementById('promo-discount-percent').value = `${promo.discountPercent}%`;
    document.getElementById('promo-date').value = promo.promoDate;
    document.getElementById('promo-link').value = promo.link;
    document.getElementById('promo-payment').value = promo.payment || '';
    document.getElementById('promo-shipping').value = promo.shipping || '';
    document.getElementById('promo-description').value = promo.description || '';
    document.getElementById('promo-notes').value = promo.notes || '';

    document.getElementById('form-promo-title').textContent = 'Editar Promoção';
    document.getElementById('btn-save-promo').textContent = 'Salvar Alterações';
    document.getElementById('btn-cancel-edit').classList.remove('hidden');
  }

  function deletePromotion(promoId) {
    if (!confirm('Tem certeza que deseja excluir esta promoção? Esta ação não pode ser desfeita.')) {
      return;
    }
    const promotions = readStorage(STORAGE_KEYS.PROMOTIONS, []);
    const filtered = promotions.filter((p) => p.id !== promoId);
    writeStorage(STORAGE_KEYS.PROMOTIONS, filtered);
    showToast('Promoção excluída.', 'success');
    renderHistoryTable();
  }

  /* ==========================================================================
     8. GERADOR DE MENSAGENS PROMOCIONAIS E WHATSAPP
     ========================================================================== */
  function renderGeneratorOptions() {
    const promotions = readStorage(STORAGE_KEYS.PROMOTIONS, []);
    const settings = readStorage(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    const select = document.getElementById('gen-promo-select');
    const templateSelect = document.getElementById('gen-template-select');

    const prevSelected = select.value;
    select.innerHTML = '<option value="">-- Selecione uma promoção --</option>';

    promotions.forEach((p) => {
      const opt = createEl('option', {
        text: `${p.name} (${formatBRL(p.discountPrice)} | -${p.discountPercent}%)`,
        attrs: { value: p.id }
      });
      select.appendChild(opt);
    });

    if (prevSelected && promotions.some((p) => p.id === prevSelected)) {
      select.value = prevSelected;
    } else if (promotions.length > 0) {
      select.value = promotions[0].id;
    }

    if (settings.defaultTemplate) {
      templateSelect.value = settings.defaultTemplate;
    }

    updatePreviewClock();
    generatePromoMessage();
  }

  function buildMessageFromTemplate(promo, templateKey) {
    const orig = formatBRL(promo.originalPrice);
    const disc = formatBRL(promo.discountPrice);
    const extraPayment = promo.payment ? `\n💳 Pagamento: ${promo.payment}` : '';
    const extraShipping = promo.shipping ? `\n🚚 Frete: ${promo.shipping}` : '';
    const extraDesc = promo.description ? `\n📋 Detalhes: ${promo.description}` : '';

    switch (templateKey) {
      case 'urgencia':
        return (
          `🔥 OPORTUNIDADE RELÂMPAGO — ${promo.category.toUpperCase()}!\n\n` +
          `⚡ ${promo.name}\n` +
          `❌ De: ${orig}\n` +
          `✅ Por apenas: ${disc} (${promo.discountPercent}% OFF)` +
          `${extraPayment}${extraShipping}\n\n` +
          `🛒 Garanta o seu agora no Mercado Livre:\n${promo.link}\n\n` +
          `⚠️ Preço promocional válido até ${formatDateBR(promo.promoDate)} ou enquanto durar o estoque!`
        );

      case 'tecnico':
        return (
          `🛠️ OFERTA PARA INSTALADORES E PROFISSIONAIS\n` +
          `Categoria: ${promo.category}\n\n` +
          `🔌 Produto: ${promo.name}` +
          `${extraDesc}\n\n` +
          `💰 Valor normal: ${orig}\n` +
          `✅ Valor promocional: ${disc} (Economia de ${promo.discountPercent}%)` +
          `${extraPayment}${extraShipping}\n\n` +
          `🔗 Link oficial no Mercado Livre:\n${promo.link}\n\n` +
          `⚠️ Consulte especificações técnicas e disponibilidade no anúncio.`
        );

      case 'curto':
        return (
          `⚡ ${promo.name}\n` +
          `💰 De ${orig} por *${disc}* (-${promo.discountPercent}%)\n` +
          `🛒 Confira no Mercado Livre: ${promo.link}`
        );

      case 'padrao':
      default:
        return (
          `⚡ OFERTA ESPECIAL — MATERIAIS ELÉTRICOS!\n\n` +
          `🔥 Produto: ${promo.name}\n` +
          `💰 De: ${orig}\n` +
          `✅ Por apenas: ${disc}\n` +
          `📉 Economia de ${promo.discountPercent}%` +
          `${extraPayment}${extraShipping}\n\n` +
          `🛒 Aproveite essa oportunidade no Mercado Livre:\n` +
          `${promo.link}\n\n` +
          `⚠️ Consulte as condições e disponibilidade diretamente no anúncio!`
        );
    }
  }

  function generatePromoMessage() {
    const promoId = document.getElementById('gen-promo-select').value;
    const templateKey = document.getElementById('gen-template-select').value;
    const textarea = document.getElementById('gen-message-text');

    if (!promoId) {
      textarea.value = '';
      syncPreviewText();
      return;
    }

    const promotions = readStorage(STORAGE_KEYS.PROMOTIONS, []);
    const promo = promotions.find((p) => p.id === promoId);
    if (!promo) return;

    const text = buildMessageFromTemplate(promo, templateKey);
    textarea.value = text;
    syncPreviewText();

    // Salva a última mensagem gerada no registro da promoção
    promo.generatedMessage = text;
    writeStorage(STORAGE_KEYS.PROMOTIONS, promotions);
  }

  function syncPreviewText() {
    const text = document.getElementById('gen-message-text').value.trim();
    const previewEl = document.getElementById('msg-preview-content');
    previewEl.textContent = text || 'Nenhuma mensagem gerada ainda.';
  }

  function updatePreviewClock() {
    const now = new Date();
    document.getElementById('preview-clock').textContent = now.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function insertEmojiAtCursor(emoji) {
    const textarea = document.getElementById('gen-message-text');
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const current = textarea.value;
    textarea.value = current.substring(0, start) + emoji + current.substring(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
    syncPreviewText();
  }

  async function copyMessageToClipboard() {
    const text = document.getElementById('gen-message-text').value.trim();
    if (!text) {
      showToast('Gere ou escreva uma mensagem antes de copiar.', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast('Mensagem copiada para a área de transferência!', 'success');
    } catch (_) {
      const textarea = document.getElementById('gen-message-text');
      textarea.select();
      document.execCommand('copy');
      showToast('Mensagem copiada!', 'success');
    }
  }

  function recordShareEvent(promoId, method) {
    const shares = readStorage(STORAGE_KEYS.SHARES, []);
    shares.unshift({
      id: generateUUID(),
      promoId: promoId || null,
      method,
      timestamp: new Date().toISOString()
    });
    writeStorage(STORAGE_KEYS.SHARES, shares);
  }

  async function shareViaWhatsApp() {
    const text = document.getElementById('gen-message-text').value.trim();
    if (!text) {
      showToast('Selecione uma promoção ou escreva uma mensagem para compartilhar.', 'error');
      return;
    }

    const promoId = document.getElementById('gen-promo-select').value;
    const settings = readStorage(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    // 1. Tenta Web Share API em dispositivos móveis compatíveis se modo for 'auto'
    if (settings.shareMode === 'auto' && isMobile && navigator.share) {
      try {
        await navigator.share({
          title: 'Oferta de Material Elétrico',
          text: text
        });
        recordShareEvent(promoId, 'Web Share API');
        showToast('Compartilhamento registrado!', 'success');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return; // Usuário cancelou
      }
    }

    // 2. Fallback / Desktop: Link oficial de compartilhamento do WhatsApp com texto codificado
    const encodedText = encodeURIComponent(text);
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodedText}`;

    recordShareEvent(promoId, 'WhatsApp Link / Web');
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    showToast('WhatsApp aberto! Selecione o contato ou grupo para enviar.', 'success');
  }

  /* ==========================================================================
     9. HISTÓRICO E ANOTAÇÕES DE PROMOÇÕES
     ========================================================================== */
  function renderHistoryTable() {
    populateCategorySelects();

    const promotions = readStorage(STORAGE_KEYS.PROMOTIONS, []);
    const search = document.getElementById('filter-search').value.trim().toLowerCase();
    const catFilter = document.getElementById('filter-category').value;
    const statusFilter = document.getElementById('filter-status').value;
    const dateStart = document.getElementById('filter-date-start').value;
    const dateEnd = document.getElementById('filter-date-end').value;

    const filtered = promotions.filter((p) => {
      const matchSearch =
        !search ||
        p.name.toLowerCase().includes(search) ||
        (p.notes && p.notes.toLowerCase().includes(search)) ||
        (p.description && p.description.toLowerCase().includes(search));

      const matchCat = !catFilter || p.category === catFilter;
      const matchStatus = !statusFilter || p.status === statusFilter;

      const createdDate = p.createdAt ? p.createdAt.split('T')[0] : '';
      const matchStart = !dateStart || createdDate >= dateStart;
      const matchEnd = !dateEnd || createdDate <= dateEnd;

      return matchSearch && matchCat && matchStatus && matchStart && matchEnd;
    });

    const tbody = document.getElementById('promos-table-body');
    const emptyState = document.getElementById('promos-empty-state');
    tbody.innerHTML = '';

    if (filtered.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    filtered.forEach((p) => {
      const tr = createEl('tr');

      // Data cadastro
      tr.appendChild(createEl('td', { text: formatDateBR(p.createdAt) }));

      // Produto / Categoria
      const tdProd = createEl('td');
      tdProd.appendChild(createEl('div', { className: 'list-row-title', text: p.name }));
      tdProd.appendChild(createEl('div', { className: 'list-row-meta', text: p.category }));
      tr.appendChild(tdProd);

      // Preços
      const tdPrice = createEl('td');
      tdPrice.appendChild(createEl('div', { text: `${formatBRL(p.discountPrice)} (-${p.discountPercent}%)` }));
      tdPrice.appendChild(createEl('div', { className: 'list-row-meta', text: `De ${formatBRL(p.originalPrice)}` }));
      tr.appendChild(tdPrice);

      // Validade
      tr.appendChild(createEl('td', { text: formatDateBR(p.promoDate) }));

      // Status
      const tdStatus = createEl('td');
      tdStatus.appendChild(
        createEl('span', {
          className: `status-pill status-${p.status}`,
          text: p.status
        })
      );
      tr.appendChild(tdStatus);

      // Ações
      const tdActions = createEl('td');
      const actionsWrap = createEl('div', { className: 'table-actions' });

      const btnView = createEl('button', { className: 'btn btn-secondary btn-sm', text: 'Detalhes' });
      btnView.addEventListener('click', () => openPromoModal(p.id));

      const btnShare = createEl('button', { className: 'btn btn-secondary btn-sm', text: 'WhatsApp' });
      btnShare.addEventListener('click', () => {
        navigateTo('gerador');
        document.getElementById('gen-promo-select').value = p.id;
        generatePromoMessage();
      });

      const btnEdit = createEl('button', { className: 'btn btn-secondary btn-sm', text: 'Editar' });
      btnEdit.addEventListener('click', () => editPromotion(p.id));

      const btnDel = createEl('button', { className: 'btn btn-danger btn-sm', text: 'Excluir' });
      btnDel.addEventListener('click', () => deletePromotion(p.id));

      actionsWrap.append(btnView, btnShare, btnEdit, btnDel);
      tdActions.appendChild(actionsWrap);
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    });
  }

  function openPromoModal(promoId) {
    const promotions = readStorage(STORAGE_KEYS.PROMOTIONS, []);
    const p = promotions.find((item) => item.id === promoId);
    if (!p) return;

    currentModalPromoId = p.id;
    const body = document.getElementById('modal-body');
    body.innerHTML = '';

    const fields = [
      ['Produto', p.name],
      ['Categoria', p.category],
      ['Status', p.status.toUpperCase()],
      ['Preço Original', formatBRL(p.originalPrice)],
      ['Preço Promocional', `${formatBRL(p.discountPrice)} (${p.discountPercent}% OFF)`],
      ['Data do Cadastro', formatDateTimeBR(p.createdAt)],
      ['Data da Promoção', formatDateBR(p.promoDate)],
      ['Pagamento', p.payment || 'Não informado'],
      ['Frete', p.shipping || 'Não informado'],
      ['Descrição', p.description || 'Sem descrição'],
      ['Anotações Internas', p.notes || 'Sem anotações']
    ];

    fields.forEach(([label, val]) => {
      const row = createEl('div', { className: 'detail-row' });
      row.appendChild(createEl('strong', { text: `${label}: ` }));
      row.appendChild(document.createTextNode(val));
      body.appendChild(row);
    });

    // Link clicável seguro
    const linkRow = createEl('div', { className: 'detail-row' });
    linkRow.appendChild(createEl('strong', { text: 'Link Mercado Livre: ' }));
    const anchor = createEl('a', {
      text: p.link,
      attrs: {
        href: p.link,
        target: '_blank',
        rel: 'noopener noreferrer',
        style: 'color: #ffffff; word-break: break-all;'
      }
    });
    linkRow.appendChild(anchor);
    body.appendChild(linkRow);

    document.getElementById('detail-modal').classList.add('open');
  }

  function closePromoModal() {
    document.getElementById('detail-modal').classList.remove('open');
    currentModalPromoId = null;
  }

  /* ==========================================================================
     10. RELATÓRIOS DE FREQUÊNCIA DE ACESSO E GRÁFICO
     ========================================================================== */
  function renderAccessReports() {
    const accessLog = readStorage(STORAGE_KEYS.ACCESS_LOG, []);
    const todayKey = getLocalISODate();

    const todayCount = accessLog.filter((a) => a.dateKey === todayKey).length;
    const weekCount = accessLog.filter((a) => {
      const diff = (Date.now() - new Date(a.timestamp).getTime()) / (1000 * 60 * 60 * 24);
      return diff <= 7;
    }).length;
    const monthCount = accessLog.filter((a) => {
      const diff = (Date.now() - new Date(a.timestamp).getTime()) / (1000 * 60 * 60 * 24);
      return diff <= 30;
    }).length;

    const allDistinctDays = new Set(accessLog.map((a) => a.dateKey)).size;
    const lastAccess = accessLog.length > 0 ? formatDateTimeBR(accessLog[0].timestamp) : '-';

    document.getElementById('rep-total-sessions').textContent = accessLog.length;
    document.getElementById('rep-today-sessions').textContent = todayCount;
    document.getElementById('rep-week-sessions').textContent = weekCount;
    document.getElementById('rep-month-sessions').textContent = monthCount;
    document.getElementById('rep-distinct-days').textContent = allDistinctDays;
    document.getElementById('rep-last-access').textContent = lastAccess;

    // Gráfico de barras responsivo dos últimos 14 dias
    const chartContainer = document.getElementById('access-chart-container');
    chartContainer.innerHTML = '';
    const barChart = createEl('div', { className: 'bar-chart' });

    const daysData = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = getLocalISODate(d);
      const count = accessLog.filter((a) => a.dateKey === key).length;
      daysData.push({
        label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        count
      });
    }

    const maxCount = Math.max(...daysData.map((d) => d.count), 1);

    daysData.forEach((day) => {
      const col = createEl('div', { className: 'bar-col' });
      col.appendChild(createEl('span', { className: 'bar-count', text: String(day.count) }));

      const heightPercent = Math.round((day.count / maxCount) * 100);
      const fill = createEl('div', {
        className: day.count === 0 ? 'bar-fill zero' : 'bar-fill',
        attrs: { style: `height: ${day.count === 0 ? 4 : Math.max(heightPercent, 8)}%;` }
      });

      col.appendChild(fill);
      col.appendChild(createEl('span', { className: 'bar-label', text: day.label }));
      barChart.appendChild(col);
    });

    chartContainer.appendChild(barChart);

    // Tabela de histórico de sessões
    const tbody = document.getElementById('access-history-body');
    tbody.innerHTML = '';

    const weekdays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

    accessLog.slice(0, 30).forEach((acc, index) => {
      const d = new Date(acc.timestamp);
      const tr = createEl('tr');
      tr.appendChild(createEl('td', { text: String(accessLog.length - index) }));
      tr.appendChild(createEl('td', { text: d.toLocaleDateString('pt-BR') }));
      tr.appendChild(createEl('td', { text: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }));
      tr.appendChild(createEl('td', { text: weekdays[d.getDay()] }));
      tr.appendChild(createEl('td', { text: acc.device }));
      tbody.appendChild(tr);
    });
  }

  /* ==========================================================================
     11. PROGRAMA DE FIDELIDADE (CUPONS POR RECORRÊNCIA)
     ========================================================================== */
  function renderLoyaltyView() {
    const settings = readStorage(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    const accessLog = readStorage(STORAGE_KEYS.ACCESS_LOG, []);
    const coupons = readStorage(STORAGE_KEYS.COUPONS, []);

    // Regras e progresso atual
    const rulesGrid = document.getElementById('loyalty-rules-grid');
    rulesGrid.innerHTML = '';

    settings.loyaltyRules.forEach((rule) => {
      const currentDays = getDistinctDaysInWindow(accessLog, rule.periodDays);
      const pct = Math.min(100, Math.round((currentDays / rule.requiredDays) * 100));

      const card = createEl('div', { className: 'rule-card' });
      card.appendChild(createEl('strong', { text: `Cupom de ${rule.discount}% OFF` }));
      card.appendChild(
        createEl('p', {
          className: 'helper-text',
          text: `Meta: ${rule.requiredDays} dias distintos em ${rule.periodDays} dias.`
        })
      );
      card.appendChild(
        createEl('div', {
          className: 'list-row-meta',
          text: `Progresso atual: ${currentDays} / ${rule.requiredDays} dias (${pct}%)`
        })
      );

      const track = createEl('div', { className: 'progress-track' });
      const fill = createEl('div', { className: 'progress-fill', attrs: { style: `width: ${pct}%;` } });
      track.appendChild(fill);
      card.appendChild(track);

      rulesGrid.appendChild(card);
    });

    // Cupons disponíveis vs anteriores
    const available = coupons.filter((c) => c.status === 'disponivel');
    const past = coupons.filter((c) => c.status !== 'disponivel');

    const banner = document.getElementById('coupon-banner');
    if (available.length > 0) {
      const latest = available[0];
      banner.classList.remove('hidden');
      banner.innerHTML = '';

      const textWrap = createEl('div');
      textWrap.appendChild(createEl('strong', { text: 'CUPOM DE DESCONTO LIBERADO! ' }));
      textWrap.appendChild(
        document.createTextNode(
          `Parabéns! Você atingiu a recorrência de acesso. Seu cupom especial: ${latest.code} (${latest.discount}% de desconto).`
        )
      );

      const copyBtn = createEl('button', { className: 'btn btn-primary btn-sm', text: 'Copiar Código' });
      copyBtn.addEventListener('click', () => copyCouponCode(latest.code));

      banner.append(textWrap, copyBtn);
    } else {
      banner.classList.add('hidden');
    }

    renderCouponCards(available, 'available-coupons-list', true);
    renderCouponCards(past, 'past-coupons-list', false);
  }

  function renderCouponCards(list, containerId, isAvailable) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    if (list.length === 0) {
      container.appendChild(
        createEl('p', {
          className: 'helper-text',
          text: isAvailable ? 'Nenhum cupom disponível no momento.' : 'Nenhum cupom utilizado ou expirado.'
        })
      );
      return;
    }

    list.forEach((coupon) => {
      const card = createEl('div', { className: 'coupon-card' });

      const top = createEl('div');
      top.appendChild(createEl('strong', { text: `Desconto de ${coupon.discount}%` }));
      top.appendChild(
        createEl('div', {
          className: 'list-row-meta',
          text: `Gerado em: ${formatDateBR(coupon.createdAt)} • Validade: ${formatDateBR(coupon.expiresAt)}`
        })
      );

      const codeBox = createEl('div', { className: 'coupon-code-box' });
      codeBox.appendChild(createEl('span', { text: coupon.code }));

      if (isAvailable) {
        const copyBtn = createEl('button', { className: 'btn btn-secondary btn-sm', text: 'Copiar' });
        copyBtn.addEventListener('click', () => copyCouponCode(coupon.code));
        codeBox.appendChild(copyBtn);
      } else {
        codeBox.appendChild(createEl('span', { className: 'status-pill status-encerrada', text: coupon.status }));
      }

      card.append(top, codeBox);

      if (isAvailable) {
        const markUsedBtn = createEl('button', {
          className: 'btn btn-secondary btn-sm',
          text: 'Marcar como Utilizado'
        });
        markUsedBtn.addEventListener('click', () => markCouponAsUsed(coupon.id));
        card.appendChild(markUsedBtn);
      }

      container.appendChild(card);
    });
  }

  async function copyCouponCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      showToast(`Código ${code} copiado!`, 'success');
    } catch (_) {
      showToast(`Código do cupom: ${code}`, 'info');
    }
  }

  function markCouponAsUsed(couponId) {
    const coupons = readStorage(STORAGE_KEYS.COUPONS, []);
    const idx = coupons.findIndex((c) => c.id === couponId);
    if (idx !== -1) {
      coupons[idx].status = 'utilizado';
      writeStorage(STORAGE_KEYS.COUPONS, coupons);
      showToast('Cupom marcado como utilizado.', 'success');
      renderLoyaltyView();
    }
  }

  /* ==========================================================================
     12. CONFIGURAÇÕES, BACKUP JSON E LIMPEZA
     ========================================================================== */
  function renderSettingsView() {
    const settings = readStorage(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    const categories = readStorage(STORAGE_KEYS.CATEGORIES, DEFAULT_CATEGORIES);

    document.getElementById('cfg-system-name').value = settings.systemName;
    document.getElementById('cfg-manager-name').value = settings.managerName;
    document.getElementById('cfg-share-mode').value = settings.shareMode;
    document.getElementById('cfg-default-template').value = settings.defaultTemplate;

    // Regras
    if (settings.loyaltyRules && settings.loyaltyRules.length >= 3) {
      document.getElementById('rule-1-days').value = settings.loyaltyRules[0].requiredDays;
      document.getElementById('rule-1-period').value = settings.loyaltyRules[0].periodDays;
      document.getElementById('rule-2-days').value = settings.loyaltyRules[1].requiredDays;
      document.getElementById('rule-2-period').value = settings.loyaltyRules[1].periodDays;
      document.getElementById('rule-3-days').value = settings.loyaltyRules[2].requiredDays;
      document.getElementById('rule-3-period').value = settings.loyaltyRules[2].periodDays;
    }

    // Lista de categorias
    const listEl = document.getElementById('categories-manage-list');
    listEl.innerHTML = '';

    categories.forEach((cat) => {
      const li = createEl('li', { className: 'tag-item' });
      li.appendChild(createEl('span', { text: cat }));

      const delBtn = createEl('button', {
        className: 'tag-remove',
        text: '×',
        attrs: { type: 'button', title: `Remover ${cat}` }
      });
      delBtn.addEventListener('click', () => removeCategory(cat));

      li.appendChild(delBtn);
      listEl.appendChild(li);
    });
  }

  function handleSaveSettings(event) {
    event.preventDefault();
    const settings = readStorage(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);

    settings.systemName = document.getElementById('cfg-system-name').value.trim() || 'EletroPromo ML';
    settings.managerName = document.getElementById('cfg-manager-name').value.trim();
    settings.shareMode = document.getElementById('cfg-share-mode').value;
    settings.defaultTemplate = document.getElementById('cfg-default-template').value;

    writeStorage(STORAGE_KEYS.SETTINGS, settings);
    applyBrandingHeader();
    showToast('Preferências salvas com sucesso!', 'success');
  }

  function handleAddCategory(event) {
    event.preventDefault();
    const input = document.getElementById('new-category-name');
    const name = input.value.trim();
    if (!name) return;

    const categories = readStorage(STORAGE_KEYS.CATEGORIES, DEFAULT_CATEGORIES);
    if (categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
      showToast('Esta categoria já existe.', 'error');
      return;
    }

    categories.push(name);
    writeStorage(STORAGE_KEYS.CATEGORIES, categories);
    input.value = '';
    renderSettingsView();
    populateCategorySelects();
    showToast('Categoria adicionada!', 'success');
  }

  function removeCategory(catName) {
    const categories = readStorage(STORAGE_KEYS.CATEGORIES, DEFAULT_CATEGORIES);
    if (categories.length <= 1) {
      showToast('É necessário manter pelo menos uma categoria.', 'error');
      return;
    }
    const updated = categories.filter((c) => c !== catName);
    writeStorage(STORAGE_KEYS.CATEGORIES, updated);
    renderSettingsView();
    populateCategorySelects();
    showToast('Categoria removida.', 'success');
  }

  function handleSaveRules(event) {
    event.preventDefault();
    const settings = readStorage(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);

    settings.loyaltyRules[0].requiredDays = parseInt(document.getElementById('rule-1-days').value, 10) || 3;
    settings.loyaltyRules[0].periodDays = parseInt(document.getElementById('rule-1-period').value, 10) || 7;
    settings.loyaltyRules[1].requiredDays = parseInt(document.getElementById('rule-2-days').value, 10) || 7;
    settings.loyaltyRules[1].periodDays = parseInt(document.getElementById('rule-2-period').value, 10) || 30;
    settings.loyaltyRules[2].requiredDays = parseInt(document.getElementById('rule-3-days').value, 10) || 15;
    settings.loyaltyRules[2].periodDays = parseInt(document.getElementById('rule-3-period').value, 10) || 30;

    writeStorage(STORAGE_KEYS.SETTINGS, settings);
    evaluateLoyaltyCoupons();
    showToast('Regras de recorrência atualizadas!', 'success');
  }

  function exportBackupJSON() {
    const backup = {
      exportedAt: new Date().toISOString(),
      version: 1,
      data: {
        promotions: readStorage(STORAGE_KEYS.PROMOTIONS, []),
        categories: readStorage(STORAGE_KEYS.CATEGORIES, DEFAULT_CATEGORIES),
        shares: readStorage(STORAGE_KEYS.SHARES, []),
        accessLog: readStorage(STORAGE_KEYS.ACCESS_LOG, []),
        coupons: readStorage(STORAGE_KEYS.COUPONS, []),
        settings: readStorage(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS)
      }
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = createEl('a', {
      attrs: {
        href: url,
        download: `backup-eletropromo-${getLocalISODate()}.json`
      }
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Backup JSON exportado com sucesso!', 'success');
  }

  function importBackupJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed || !parsed.data) {
          throw new Error('Estrutura de arquivo inválida.');
        }

        if (Array.isArray(parsed.data.promotions)) writeStorage(STORAGE_KEYS.PROMOTIONS, parsed.data.promotions);
        if (Array.isArray(parsed.data.categories)) writeStorage(STORAGE_KEYS.CATEGORIES, parsed.data.categories);
        if (Array.isArray(parsed.data.shares)) writeStorage(STORAGE_KEYS.SHARES, parsed.data.shares);
        if (Array.isArray(parsed.data.accessLog)) writeStorage(STORAGE_KEYS.ACCESS_LOG, parsed.data.accessLog);
        if (Array.isArray(parsed.data.coupons)) writeStorage(STORAGE_KEYS.COUPONS, parsed.data.coupons);
        if (parsed.data.settings) writeStorage(STORAGE_KEYS.SETTINGS, parsed.data.settings);

        applyBrandingHeader();
        renderSettingsView();
        showToast('Backup importado e restaurado com sucesso!', 'success');
      } catch (err) {
        showToast('Falha ao importar backup: arquivo JSON inválido.', 'error');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  function clearAllStoredData() {
    if (
      !confirm(
        'ATENÇÃO: Isso apagará todas as promoções, histórico de acessos, cupons e configurações deste navegador. Deseja continuar?'
      )
    ) {
      return;
    }

    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    sessionStorage.removeItem(SESSION_FLAG_KEY);

    initializeDefaultData();
    registerAccessSession();
    applyBrandingHeader();
    navigateTo('dashboard');
    showToast('Todos os dados locais foram limpos.', 'success');
  }

  /* ==========================================================================
     13. REGISTRO DE EVENTOS (BOOTSTRAP)
     ========================================================================== */
  function bindEvents() {
    // Navegação sidebar e atalhos
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.target));
    });

    document.querySelectorAll('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.goto));
    });

    // Menu Mobile
    document.getElementById('open-sidebar-btn').addEventListener('click', openMobileSidebar);
    document.getElementById('close-sidebar-btn').addEventListener('click', closeMobileSidebar);
    document.getElementById('sidebar-overlay').addEventListener('click', closeMobileSidebar);

    // Formulário de Promoção
    const origPriceInput = document.getElementById('promo-original-price');
    const discPriceInput = document.getElementById('promo-discount-price');

    origPriceInput.addEventListener('input', () => {
      applyCurrencyMask(origPriceInput);
      updateDiscountCalculation();
    });

    discPriceInput.addEventListener('input', () => {
      applyCurrencyMask(discPriceInput);
      updateDiscountCalculation();
    });

    document.getElementById('promo-form').addEventListener('submit', handlePromoSubmit);
    document.getElementById('btn-reset-promo').addEventListener('click', () => {
      setTimeout(resetPromoForm, 0);
    });
    document.getElementById('btn-cancel-edit').addEventListener('click', () => {
      resetPromoForm();
      navigateTo('historico');
    });

    // Gerador de Mensagens e WhatsApp
    document.getElementById('gen-promo-select').addEventListener('change', generatePromoMessage);
    document.getElementById('gen-template-select').addEventListener('change', generatePromoMessage);
    document.getElementById('gen-message-text').addEventListener('input', syncPreviewText);
    document.getElementById('btn-regenerate-msg').addEventListener('click', generatePromoMessage);
    document.getElementById('btn-copy-msg').addEventListener('click', copyMessageToClipboard);
    document.getElementById('btn-share-whatsapp').addEventListener('click', shareViaWhatsApp);

    document.querySelectorAll('.emoji-btn').forEach((btn) => {
      btn.addEventListener('click', () => insertEmojiAtCursor(btn.dataset.emoji));
    });

    // Filtros do Histórico
    ['filter-search', 'filter-category', 'filter-status', 'filter-date-start', 'filter-date-end'].forEach((id) => {
      document.getElementById(id).addEventListener('input', renderHistoryTable);
    });

    document.getElementById('btn-clear-filters').addEventListener('click', () => {
      document.getElementById('filter-search').value = '';
      document.getElementById('filter-category').value = '';
      document.getElementById('filter-status').value = '';
      document.getElementById('filter-date-start').value = '';
      document.getElementById('filter-date-end').value = '';
      renderHistoryTable();
    });

    // Modal de Detalhes
    document.getElementById('close-modal-btn').addEventListener('click', closePromoModal);
    document.getElementById('modal-close-footer-btn').addEventListener('click', closePromoModal);
    document.getElementById('detail-modal').addEventListener('click', (e) => {
      if (e.target.id === 'detail-modal') closePromoModal();
    });
    document.getElementById('modal-use-generator-btn').addEventListener('click', () => {
      const targetId = currentModalPromoId;
      closePromoModal();
      if (targetId) {
        navigateTo('gerador');
        document.getElementById('gen-promo-select').value = targetId;
        generatePromoMessage();
      }
    });

    // Configurações e Backups
    document.getElementById('settings-form').addEventListener('submit', handleSaveSettings);
    document.getElementById('category-form').addEventListener('submit', handleAddCategory);
    document.getElementById('rules-form').addEventListener('submit', handleSaveRules);
    document.getElementById('btn-export-json').addEventListener('click', exportBackupJSON);
    document.getElementById('input-import-json').addEventListener('change', importBackupJSON);
    document.getElementById('btn-clear-all-data').addEventListener('click', clearAllStoredData);
  }

  // Inicialização da Aplicação
  document.addEventListener('DOMContentLoaded', () => {
    initializeDefaultData();
    registerAccessSession();
    evaluateLoyaltyCoupons();
    applyBrandingHeader();
    populateCategorySelects();
    document.getElementById('promo-date').value = getLocalISODate();
    bindEvents();
    renderDashboard();
  });
})();