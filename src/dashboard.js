import { db, auth } from './firebase-config.js';
import { 
    collection, 
    query, 
    where, 
    getDocs, 
    doc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const formatador = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// --- 1. CARREGAMENTO DOS DADOS ---
async function carregarDashboard(user) {
    try {
        const userRef = doc(db, "usuarios", user.uid);
        const userSnap = await getDoc(userRef);
        let dadosUsuario = {};

        if (userSnap.exists()) {
            dadosUsuario = userSnap.data();
            
            // Atualiza o nome do negócio em todos os lugares (Sidebar, Nav Mobile, Boas-vindas)
            const elementosNome = ['sideNomeNegocio', 'navNomeNegocio', 'boasVindasNome'];
            elementosNome.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    // Se for boasVindasNome, usamos o primeiro nome ou o nome do negócio
                    if(id === 'boasVindasNome') {
                        el.innerText = dadosUsuario.nomeNegocio?.split(' ')[0] || "Parceiro";
                    } else {
                        el.innerText = dadosUsuario.nomeNegocio || "Meu Negócio";
                    }
                }
            });

            // Aplica cor customizada se existir
            if (dadosUsuario.corTema) {
                document.documentElement.style.setProperty('--cor-primaria', dadosUsuario.corTema);
                localStorage.setItem('tema-cor', dadosUsuario.corTema);
            }
        }

        const produtosRef = collection(db, "produtos");
        const pedidosRef = collection(db, "pedidos");

        // Busca produtos e pedidos simultaneamente para performance
        const [snapProdutos, snapPedidos] = await Promise.all([
            getDocs(query(produtosRef, where("userId", "==", user.uid))),
            getDocs(query(pedidosRef, where("userId", "==", user.uid)))
        ]);

        let faturamentoTotal = 0;
        let alertasEstoque = [];
        let contagemVendas = {}; 
        const nicho = (dadosUsuario.categoriaNegocio || "comércio").toLowerCase();

        // Processar Pedidos
        snapPedidos.forEach(doc => {
            const pedido = doc.data();
            faturamentoTotal += parseFloat(pedido.total || 0);
            
            if (pedido.itens && Array.isArray(pedido.itens)) {
                pedido.itens.forEach(item => {
                    contagemVendas[item.nome] = (contagemVendas[item.nome] || 0) + (parseInt(item.qtd) || 1);
                });
            }
        });

        // Processar Alertas de Estoque
        snapProdutos.forEach(doc => {
            const p = doc.data();
            const atual = parseInt(p.estoqueAtual || 0);
            const minimo = parseInt(p.estoqueMinimo || 0);
            if (atual <= minimo) {
                alertasEstoque.push({ nome: p.nome, qtd: atual, esgotado: atual === 0 });
            }
        });

        // --- MOTOR DE INSIGHTS INTELIGENTES ---
        const obterInsight = () => {
            const hora = new Date().getHours();
            const topProduto = Object.entries(contagemVendas).sort((a, b) => b[1] - a[1])[0];

            if (alertasEstoque.some(a => a.esgotado)) {
                return `<i data-lucide="octagon-alert" class="inline-block w-5 h-5 mr-2 text-red-500 align-middle"></i> <b>Ruptura detectada:</b> Você tem produtos esgotados no estoque!`;
            }

            if (nicho.includes("padaria") || nicho.includes("café") || nicho.includes("lanchonete")) {
                if (hora >= 6 && hora <= 10) return `<i data-lucide="coffee" class="inline-block w-5 h-5 mr-2 text-orange-500 align-middle"></i> <b>Hora do Pico:</b> O movimento matinal costuma ser alto agora.`;
                if (hora >= 16 && hora <= 19) return `<i data-lucide="croissant" class="inline-block w-5 h-5 mr-2 text-orange-400 align-middle"></i> <b>Dica de Tarde:</b> Prepare o estoque para o lanche da tarde.`;
            }

            if (topProduto && topProduto[1] > 5) {
                return `<i data-lucide="trending-up" class="inline-block w-5 h-5 mr-2 text-green-500 align-middle"></i> <b>Sucesso de Vendas:</b> O item "${topProduto[0]}" é o seu carro-chefe.`;
            }

            if (alertasEstoque.length > 0) {
                return `<i data-lucide="package-search" class="inline-block w-5 h-5 mr-2 text-orange-500 align-middle"></i> <b>Atenção:</b> Você tem ${alertasEstoque.length} itens precisando de reposição.`;
            }

            return `<i data-lucide="sparkles" class="inline-block w-5 h-5 mr-2 text-brand align-middle"></i> <b>Dica:</b> Mantenha seus preços atualizados para garantir a margem de lucro.`;
        };

        // --- 2. ATUALIZAÇÃO DA UI ---

        // Atualizar Cards Principais
        const elFaturamento = document.getElementById('faturamentoMes');
        const elAlertaEstoque = document.getElementById('totalAlertasEstoque');
        const elTotalClientes = document.getElementById('totalClientes');

        if (elFaturamento) elFaturamento.innerText = formatador.format(faturamentoTotal);
        if (elAlertaEstoque) elAlertaEstoque.innerText = alertasEstoque.length;
        if (elTotalClientes) elTotalClientes.innerText = snapPedidos.size;

        // Atualizar Notificações (Sininho)
        const badgeMobile = document.getElementById('badgeNotificacao');
        const badgeDesk = document.getElementById('badgeNotificacaoDesktop');
        const containerAlertas = document.getElementById('containerAlertas');

        if (alertasEstoque.length > 0) {
            if (badgeMobile) {
                badgeMobile.classList.remove('hidden');
                badgeMobile.innerText = alertasEstoque.length;
            }
            if (badgeDesk) badgeDesk.classList.remove('hidden');

            containerAlertas.innerHTML = alertasEstoque.map(alerta => {
                const corCard = alerta.esgotado ? 'bg-red-50 border-red-100' : 'bg-orange-50 border-orange-100';
                const corTexto = alerta.esgotado ? 'text-red-600' : 'text-orange-600';
                const icon = alerta.esgotado ? 'circle-off' : 'alert-circle';
                const label = alerta.esgotado ? 'ESGOTADO' : 'REPOR';

                return `
                    <div class="flex items-center gap-3 p-4 ${corCard} rounded-2xl border mb-2 transition-all hover:scale-[1.02]">
                        <div class="${corTexto}">
                             <i data-lucide="${icon}" class="w-5 h-5"></i>
                        </div>
                        <div class="flex-1">
                            <p class="text-xs font-bold text-slate-700 uppercase leading-tight">${alerta.nome}</p>
                            <p class="text-[10px] ${corTexto} font-black mt-1 uppercase tracking-wider">${label}: ${alerta.qtd} UNIDADES</p>
                        </div>
                    </div>
                `;
            }).join('');
            
            const statusEstoque = document.getElementById('statusEstoqueGeral');
            if (statusEstoque) {
                statusEstoque.innerText = "Ação Necessária";
                statusEstoque.className = "text-[10px] font-bold text-red-500 uppercase mt-3 block tracking-wider";
            }
        } else {
            containerAlertas.innerHTML = `
                <div class="py-10 text-center">
                    <div class="w-12 h-12 bg-green-50 text-green-400 rounded-full flex items-center justify-center mx-auto mb-3">
                        <i data-lucide="check-circle" class="w-6 h-6"></i>
                    </div>
                    <p class="text-xs text-slate-400 font-medium">Seu estoque está saudável!</p>
                </div>`;
            
            if (badgeMobile) badgeMobile.classList.add('hidden');
            if (badgeDesk) badgeDesk.classList.add('hidden');
        }

        // Atualizar Top 3 Produtos
        const containerTop = document.getElementById('containerTopProdutos');
        const topProdutos = Object.entries(contagemVendas)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        if (topProdutos.length > 0 && containerTop) {
            containerTop.innerHTML = topProdutos.map(([nome, qtd], index) => `
                <div class="flex items-center justify-between p-3 hover:bg-white/5 rounded-2xl transition-colors border border-transparent hover:border-white/10">
                    <div class="flex items-center gap-4">
                        <span class="text-sm font-black text-brand w-6">${index + 1}º</span>
                        <span class="text-sm font-bold text-slate-300">${nome}</span>
                    </div>
                    <span class="text-[10px] bg-slate-800 px-3 py-1.5 rounded-xl text-slate-400 border border-white/5 font-black uppercase tracking-tighter">${qtd} vendid.</span>
                </div>
            `).join('');
        }

        // Aplicar Insight Inteligente
        const insightEl = document.getElementById('insightTexto');
        if (insightEl) {
            insightEl.innerHTML = obterInsight();
        }

        // Re-inicializa ícones para o conteúdo novo
        if (window.lucide) {
            window.lucide.createIcons();
        }

    } catch (error) {
        console.error("Erro ao carregar Dashboard:", error);
    }
}

// --- 3. MONITOR DE AUTENTICAÇÃO ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        carregarDashboard(user);
    } else {
        window.location.href = 'index.html';
    }
});

// --- 4. LOGOUT ---
const logoutAction = async () => {
    const confirmacao = await Swal.fire({
        title: 'Sair do Sistema?',
        text: "Sua sessão será encerrada com segurança.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#2563eb', // Cor brand
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sair agora',
        cancelButtonText: 'Ficar',
        customClass: {
            popup: 'rounded-[2.5rem]',
            confirmButton: 'rounded-2xl px-6 py-3',
            cancelButton: 'rounded-2xl px-6 py-3'
        }
    });

    if (confirmacao.isConfirmed) {
        try {
            await signOut(auth);
            localStorage.clear();
            window.location.href = 'index.html';
        } catch (error) {
            console.error("Erro ao sair:", error);
        }
    }
};

document.getElementById('btnSairDesktop')?.addEventListener('click', logoutAction);
