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
            const elementosNome = ['sideNomeNegocio', 'navNomeNegocio', 'boasVindasNome'];
            elementosNome.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerText = dadosUsuario.nomeNegocio || "Meu Negócio";
            });

            if (dadosUsuario.corTema) {
                document.documentElement.style.setProperty('--cor-primaria', dadosUsuario.corTema);
                localStorage.setItem('tema-cor', dadosUsuario.corTema);
            }
        }

        const produtosRef = collection(db, "produtos");
        const pedidosRef = collection(db, "pedidos");

        const [snapProdutos, snapPedidos] = await Promise.all([
            getDocs(query(produtosRef, where("userId", "==", user.uid))),
            getDocs(query(pedidosRef, where("userId", "==", user.uid)))
        ]);

        let faturamentoTotal = 0;
        let alertasEstoque = [];
        let contagemVendas = {}; 
        const nicho = (dadosUsuario.categoriaNegocio || "comércio").toLowerCase();

        snapPedidos.forEach(doc => {
            const pedido = doc.data();
            faturamentoTotal += parseFloat(pedido.total || 0);
            
            if (pedido.itens && Array.isArray(pedido.itens)) {
                pedido.itens.forEach(item => {
                    contagemVendas[item.nome] = (contagemVendas[item.nome] || 0) + (parseInt(item.qtd) || 1);
                });
            }
        });

        snapProdutos.forEach(doc => {
            const p = doc.data();
            const atual = parseInt(p.estoqueAtual || 0);
            const minimo = parseInt(p.estoqueMinimo || 0);
            if (atual <= minimo) {
                alertasEstoque.push({ nome: p.nome, qtd: atual, esgotado: atual === 0 });
            }
        });

        // --- D. MOTOR DE INSIGHTS INTELIGENTES ---
        const obterInsight = () => {
            const hora = new Date().getHours();
            const topProduto = Object.entries(contagemVendas).sort((a, b) => b[1] - a[1])[0];
            const ticketMedio = snapPedidos.size > 0 ? faturamentoTotal / snapPedidos.size : 0;

            if (alertasEstoque.some(a => a.esgotado)) {
                return `<i data-lucide="octagon-alert" class="inline-block w-4 h-4 mr-1 text-red-500"></i> <b>Ruptura detectada:</b> Você tem produtos esgotados!`;
            }

            if (nicho.includes("padaria") || nicho.includes("café")) {
                if (hora >= 6 && hora <= 10) return `<i data-lucide="coffee" class="inline-block w-4 h-4 mr-1 text-orange-500"></i> <b>Hora do Pico:</b> O movimento de pães está alto.`;
                if (hora >= 16 && hora <= 19) return `<i data-lucide="croissant" class="inline-block w-4 h-4 mr-1 text-orange-400"></i> <b>Dica:</b> Muitos clientes buscam o lanche da tarde.`;
            }

            if (nicho.includes("doce") || nicho.includes("confeitaria")) {
                if (topProduto) return `<i data-lucide="cookie" class="inline-block w-4 h-4 mr-1 text-pink-500"></i> <b>Destaque:</b> Seu "${topProduto[0]}" é o favorito.`;
            }

            if (alertasEstoque.length > 0) {
                return `<i data-lucide="package-search" class="inline-block w-4 h-4 mr-1 text-orange-500"></i> <b>Atenção:</b> ${alertasEstoque.length} itens no limite.`;
            }

            return `<i data-lucide="lightbulb" class="inline-block w-4 h-4 mr-1 text-yellow-500"></i> <b>Dica:</b> Mantenha seu estoque atualizado para melhores insights.`;
        };

        // --- 2. ATUALIZAÇÃO DA UI ---

        if (document.getElementById('faturamentoMes')) 
            document.getElementById('faturamentoMes').innerText = formatador.format(faturamentoTotal);
        
        if (document.getElementById('totalAlertasEstoque'))
            document.getElementById('totalAlertasEstoque').innerText = alertasEstoque.length;
        
        if (document.getElementById('totalClientes'))
            document.getElementById('totalClientes').innerText = snapPedidos.size;

        // Atualizar Sininho e Alertas
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
                    <div class="flex items-center gap-3 p-3 ${corCard} rounded-xl border mb-2 transition-all hover:scale-[1.02]">
                        <div class="${corTexto}">
                             <i data-lucide="${icon}" class="w-4 h-4"></i>
                        </div>
                        <div class="flex-1">
                            <p class="text-[11px] font-bold text-slate-700 uppercase leading-tight">${alerta.nome}</p>
                            <p class="text-[10px] ${corTexto} font-black mt-0.5">${label}: ${alerta.qtd} UNIDADES</p>
                        </div>
                    </div>
                `;
            }).join('');
            
            const statusEstoque = document.getElementById('statusEstoqueGeral');
            if (statusEstoque) {
                statusEstoque.innerText = "Reposição Necessária";
                statusEstoque.className = "text-[10px] font-bold text-red-500 uppercase tracking-tight";
            }
        } else {
            containerAlertas.innerHTML = `
                <div class="py-6 text-center">
                    <i data-lucide="check-circle" class="w-8 h-8 text-green-400 mx-auto mb-2"></i>
                    <p class="text-xs text-slate-400 italic">Tudo em dia por aqui!</p>
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
                <div class="flex items-center justify-between p-2 hover:bg-white/5 rounded-xl transition-colors">
                    <div class="flex items-center gap-3">
                        <span class="text-xs font-black text-brand">${index + 1}º</span>
                        <span class="text-sm font-bold text-slate-300">${nome}</span>
                    </div>
                    <span class="text-[10px] bg-slate-800 px-2 py-1 rounded-lg text-slate-400 border border-slate-700">${qtd} un.</span>
                </div>
            `).join('');
        }

        // Aplicar Insight Inteligente
        const insightEl = document.getElementById('insightTexto');
        if (insightEl) {
            insightEl.innerHTML = obterInsight();
        }

        // --- IMPORTANTE: Re-inicializa os ícones após renderizar o conteúdo dinâmico ---
        if (window.lucide) {
            window.lucide.createIcons();
        }

    } catch (error) {
        console.error("Erro no Dashboard:", error);
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
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sair agora',
        cancelButtonText: 'Ficar'
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
