import { db } from './firebase-config.js';
import {
    collection,
    query,
    where,
    getDocs,
    doc,
    getDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const userId = params.get('id');

// --- VARIÁVEIS DE ESTADO DA LOJA ---
let whatsappLoja = "";
let lojaAberta = false;
let horariosSemana = null; // Inicializa como null para controle de carregamento
let configEntrega = null;

// --- ESTADO DO PEDIDO ---
let carrinho = [];
let taxaEntregaAtual = 0;
let modoPedido = 'entrega';

// --- 🕒 LÓGICA DE HORÁRIOS EM TEMPO REAL ---
function atualizarStatusLoja() {
    // Se ainda não carregou os horários do banco, não faz nada
    if (!horariosSemana || Object.keys(horariosSemana).length === 0) return;

    const agora = new Date();
    const numeroDia = agora.getDay(); // 0 (Dom) a 6 (Sab)
    const horaAtualMinutos = (agora.getHours() * 60) + agora.getMinutes();

    // Mapeamento exato para as chaves do seu banco (letras minúsculas e acentos)
    const diasTraducao = [
        "domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"
    ];
    const nomeDiaHoje = diasTraducao[numeroDia];
    const configHoje = horariosSemana[nomeDiaHoje];

    const labelStatus = document.getElementById('labelStatus');
    const dotStatus = document.getElementById('dotStatus');

    // 1. Verifica se o dia existe e está marcado como aberto
    if (!configHoje || configHoje.aberto === false || !configHoje.abre || !configHoje.fecha) {
        lojaAberta = false;
        renderizarUIStatus(false, "Fechado hoje", null);
        return;
    }

    // 2. Converte horários de string para minutos
    const [hAbre, mAbre] = configHoje.abre.split(':').map(Number);
    const [hFecha, mFecha] = configHoje.fecha.split(':').map(Number);
    const minAbre = (hAbre * 60) + mAbre;
    const minFecha = (hFecha * 60) + mFecha;

    // 3. Lógica para horários (incluindo virada de dia/madrugada)
    if (minFecha < minAbre) {
        lojaAberta = (horaAtualMinutos >= minAbre || horaAtualMinutos <= minFecha);
    } else {
        lojaAberta = (horaAtualMinutos >= minAbre && horaAtualMinutos <= minFecha);
    }

    // 4. Atualiza a Interface Visual
    if (lojaAberta) {
        renderizarUIStatus(true, "Aberto", configHoje.fecha);
    } else {
        renderizarUIStatus(false, "Fechado", configHoje.abre);
    }
}

function renderizarUIStatus(aberto, texto, horaExibicao) {
    const labelStatus = document.getElementById('labelStatus');
    const dotStatus = document.getElementById('dotStatus');
    
    if (!labelStatus || !dotStatus) return;

    if (aberto) {
        dotStatus.className = "w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse";
        labelStatus.innerHTML = `<span class="text-green-600 font-bold">Aberto</span> <span class="text-slate-400 text-[10px]">até ${horaExibicao}</span>`;
    } else {
        dotStatus.className = "w-2 h-2 rounded-full bg-red-500";
        labelStatus.innerHTML = `<span class="text-red-600 font-bold">${texto}</span> ${horaExibicao ? '• Abre às ' + horaExibicao : ''}`;
    }
}

// Verifica o horário a cada 30 segundos
setInterval(atualizarStatusLoja, 30000);

// --- 🛒 FUNÇÕES DO CARRINHO ---
window.adicionarAoCarrinho = (nome, preco) => {
    if (!lojaAberta) {
        Swal.fire({ 
            icon: 'error', 
            title: 'Loja Fechada', 
            text: 'Desculpe, não estamos aceitando pedidos no momento.',
            confirmButtonColor: 'var(--cor-primaria, #ef4444)'
        });
        return;
    }
    carrinho.push({ nome, preco: Number(preco) });
    atualizarBadgeCarrinho();
};

function atualizarBadgeCarrinho() {
    const btn = document.getElementById('btnCarrinho');
    const badge = document.getElementById('qtdItensCarrinho');
    if (carrinho.length > 0) {
        btn?.classList.remove('hidden');
        if (badge) badge.innerText = carrinho.length;
    }
}

// --- 🚀 INICIALIZAÇÃO DOS DADOS ---
async function inicializarCardapio() {
    if (!userId) {
        console.error("ID do usuário não encontrado na URL.");
        return;
    }

    try {
        // 1. Carregar Configurações da Loja
        const userSnap = await getDoc(doc(db, "usuarios", userId));
        
        if (userSnap.exists()) {
            const d = userSnap.data();
            whatsappLoja = d.whatsapp || "";
            horariosSemana = d.horarios || {}; 
            configEntrega = d.configEntrega || null;

            // Elementos de Identidade
            const nomeLojaEl = document.getElementById('nomeLoja');
            if (nomeLojaEl) nomeLojaEl.innerText = d.nomeNegocio || "Loja";
            
            if (d.corTema) {
                document.documentElement.style.setProperty('--cor-primaria', d.corTema);
            }
            
            const imgLogo = document.getElementById('logoLoja');
            if (d.fotoPerfil && imgLogo) imgLogo.src = d.fotoPerfil;
            
            const imgCapa = document.getElementById('capaLoja');
            if (d.fotoCapa && imgCapa) imgCapa.style.backgroundImage = `url('${d.fotoCapa}')`;

            // Executa a primeira verificação de horário após carregar os dados
            atualizarStatusLoja();
        }

        // 2. Carregar Produtos
        const q = query(collection(db, "produtos"), where("userId", "==", userId));
        const snap = await getDocs(q);
        renderizarProdutos(snap);

    } catch (e) {
        console.error("Erro ao carregar cardápio:", e);
    } finally {
        // Esconde o loader
        const loader = document.getElementById('loading-overlay');
        if (loader) loader.classList.add('hidden');
    }
}

function renderizarProdutos(snap) {
    const main = document.getElementById('mainContainer');
    const nav = document.getElementById('navCategorias');
    if (!main || !nav) return;

    main.innerHTML = ""; 
    nav.innerHTML = "";
    const prodsPorCat = {};

    snap.forEach(doc => {
        const p = doc.data();
        if (!prodsPorCat[p.categoria]) prodsPorCat[p.categoria] = [];
        prodsPorCat[p.categoria].push(p);
    });

    Object.keys(prodsPorCat).forEach(cat => {
        const catId = cat.replace(/\s/g, '');
        
        // Link da Navegação
        nav.innerHTML += `
            <a href="#${catId}" class="px-4 py-2 bg-white rounded-full shadow-sm text-[11px] font-bold whitespace-nowrap border border-slate-100 text-slate-600">
                ${cat}
            </a>`;
        
        // Seção de Produtos
        let html = `
            <section id="${catId}" class="pt-6">
                <h2 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 px-2">${cat}</h2>
                <div class="grid grid-cols-1 gap-3">`;

        prodsPorCat[cat].forEach(p => {
            html += `
                <div class="bg-white p-3 rounded-3xl flex items-center justify-between shadow-sm border border-slate-50 transition-all active:scale-[0.98]">
                    <div class="flex-1 pr-4">
                        <h3 class="text-sm font-bold text-slate-800">${p.nome}</h3>
                        <p class="text-[10px] text-slate-400 mt-1 line-clamp-2">${p.descricao || ''}</p>
                        <p class="text-brand font-black mt-2 text-sm">R$ ${Number(p.preco).toFixed(2)}</p>
                    </div>
                    <div class="relative w-20 h-20 shrink-0">
                        <img src="${p.foto}" class="w-full h-full object-cover rounded-2xl shadow-inner bg-slate-50" onerror="this.src='https://placehold.co/200x200?text=Sem+Foto'">
                        <button onclick="adicionarAoCarrinho('${p.nome}', ${p.preco})" 
                                class="absolute -bottom-1 -right-1 w-8 h-8 bg-brand text-white rounded-xl shadow-lg flex items-center justify-center font-bold hover:brightness-110 transition-all">
                            +
                        </button>
                    </div>
                </div>`;
        });
        main.innerHTML += html + `</div></section>`;
    });
}

// Iniciar Processo
inicializarCardapio();
