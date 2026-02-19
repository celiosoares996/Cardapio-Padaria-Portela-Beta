import { db } from './firebase-config.js';
import {
    collection,
    query,
    where,
    getDocs,
    doc,
    getDoc,
    setDoc,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const userId = params.get('id');
let whatsappLoja = "";
let lojaAberta = false; // Começa fechada até validar o horário
let horariosSemana = {}; // Armazenará o mapa de horários do banco
let configEntrega = null;

// --- ESTADO GLOBAL DO PEDIDO ---
let carrinho = [];
let taxaEntregaAtual = 0;
let distanciaCliente = 0;
let modoPedido = 'entrega';
let formaPagamento = '';
let enderecoCompleto = { rua: "", bairro: "", cidade: "", cep: "" };
let clienteLogado = null;

// --- 🕒 NOVA LÓGICA DE HORÁRIOS SEMANAIS ---
function verificarStatusLoja() {
    if (!horariosSemana || Object.keys(horariosSemana).length === 0) return;

    const agora = new Date();
    const numeroDia = agora.getDay(); // 0 (Dom) a 6 (Sab)
    const horaAtualMinutos = (agora.getHours() * 60) + agora.getMinutes();

    // Mapeamento para bater com as chaves do seu Firestore
    const diasTraducao = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
    const nomeDiaHoje = diasTraducao[numeroDia];
    const configHoje = horariosSemana[nomeDiaHoje];

    const labelStatus = document.getElementById('labelStatus');
    const dotStatus = document.getElementById('dotStatus');

    // 1. Verifica se o dia está marcado como aberto e tem horários preenchidos
    if (!configHoje || !configHoje.aberto || !configHoje.abre || !configHoje.fecha) {
        lojaAberta = false;
        renderizarUIStatus(false, "Fechado hoje", null);
        return;
    }

    // 2. Converte horários "HH:mm" em minutos totais
    const [hAbre, mAbre] = configHoje.abre.split(':').map(Number);
    const [hFecha, mFecha] = configHoje.fecha.split(':').map(Number);
    const minAbre = (hAbre * 60) + mAbre;
    const minFecha = (hFecha * 60) + mFecha;

    // 3. Lógica para horários que atravessam a meia-noite (ex: 18h às 02h)
    if (minFecha < minAbre) {
        lojaAberta = (horaAtualMinutos >= minAbre || horaAtualMinutos <= minFecha);
    } else {
        lojaAberta = (horaAtualMinutos >= minAbre && horaAtualMinutos <= minFecha);
    }

    // 4. Atualiza a Interface
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
        dotStatus.className = "w-2 h-2 rounded-full bg-green-500 ping-aberto";
        labelStatus.innerHTML = `<span class="text-green-600 font-bold">Aberto</span> <span class="text-[10px] opacity-60">até ${horaExibicao}</span>`;
    } else {
        dotStatus.className = "w-2 h-2 rounded-full bg-red-500";
        labelStatus.innerHTML = `<span class="text-red-600 font-bold">${texto}</span> ${horaExibicao ? '• Abre às ' + horaExibicao : ''}`;
    }
}

// Verifica a cada 30 segundos sem precisar de F5
setInterval(verificarStatusLoja, 30000);

// --- FUNÇÃO: CÁLCULO DE DISTÂNCIA ---
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// --- LÓGICA DE IDENTIFICAÇÃO DO CLIENTE ---
window.verificarCliente = async (valor) => {
    const whatsapp = valor.replace(/\D/g, '');
    if (whatsapp.length < 10) return;
    try {
        const docRef = doc(db, "clientes", whatsapp);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const d = docSnap.data();
            clienteLogado = { ...d, whatsapp: whatsapp };
            if (document.getElementById('inputNome')) document.getElementById('inputNome').value = d.nome || "";
            if (document.getElementById('inputCEP')) document.getElementById('inputCEP').value = d.cep || "";
            if (document.getElementById('inputNumero')) document.getElementById('inputNumero').value = d.numero || "";
            if (d.cep && d.distanciaSalva) {
                distanciaCliente = d.distanciaSalva;
                recalcularTaxaEntrega();
            }
        }
    } catch (e) { console.error(e); }
};

window.mascaraCEP = (input) => {
    let v = input.value.replace(/\D/g, '');
    if (v.length > 8) v = v.substring(0, 8);
    if (v.length > 5) input.value = v.substring(0, 5) + '-' + v.substring(5, 8);
    else input.value = v;
    if (v.length === 8) window.buscarCEP();
};

window.buscarCEP = async () => {
    const cepInput = document.getElementById('inputCEP');
    const camposEndereco = document.getElementById('camposEndereco');
    const textoEnderecoAuto = document.getElementById('textoEnderecoAuto');
    if (!cepInput) return;
    const cep = cepInput.value.replace(/\D/g, '');
    if (cep.length !== 8) return;

    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();
        if (data.erro) return;

        if (camposEndereco) camposEndereco.classList.remove('hidden');
        if (textoEnderecoAuto) textoEnderecoAuto.innerText = `${data.logradouro}, ${data.bairro} - ${data.localidade}/${data.uf}`;
        enderecoCompleto = { rua: data.logradouro || "", bairro: data.bairro || "", cidade: data.localidade || "", cep: cep };

        const geoResp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&postalcode=${cep}&country=Brazil`);
        const geoData = await geoResp.json();
        if (geoData.length > 0 && configEntrega) {
            const dist = calcularDistancia(
                parseFloat(configEntrega.coords.lat),
                parseFloat(configEntrega.coords.log || configEntrega.coords.lng),
                parseFloat(geoData[0].lat),
                parseFloat(geoData[0].lon)
            );
            distanciaCliente = dist;
            recalcularTaxaEntrega();
        }
    } catch (error) { console.error(error); }
};

function recalcularTaxaEntrega() {
    if (modoPedido === 'retirada') taxaEntregaAtual = 0;
    else if (configEntrega?.tipo === 'km') taxaEntregaAtual = parseFloat((distanciaCliente * configEntrega.valorKm).toFixed(2));
    else if (configEntrega) taxaEntregaAtual = Number(configEntrega.taxaFixa) || 0;
    renderizarCarrinho();
}

window.atualizarModoPedidoJS = (modo) => {
    modoPedido = modo;
    recalcularTaxaEntrega();
    const btnProx1 = document.getElementById('btnProximo1');
    if (btnProx1) {
        btnProx1.disabled = false;
        btnProx1.classList.replace('bg-slate-200', 'bg-brand');
    }
};

// --- CARRINHO E WHATSAPP ---
window.adicionarAoCarrinho = (nome, preco) => {
    if (!lojaAberta) {
        Swal.fire({ icon: 'error', title: 'Loja Fechada', text: 'Não estamos aceitando pedidos no momento.' });
        return;
    }
    carrinho.push({ nome, preco: Number(preco) });
    atualizarBadgeCarrinho();
};

function atualizarBadgeCarrinho() {
    const btn = document.getElementById('btnCarrinho');
    const badge = document.getElementById('qtdItensCarrinho');
    if (carrinho.length > 0 && btn) {
        btn.classList.remove('hidden');
        if (badge) badge.innerText = carrinho.length;
    }
}

function renderizarCarrinho() {
    const container = document.getElementById('listaItensCarrinho');
    const totalP1 = document.getElementById('totalPasso1');
    const resumoF = document.getElementById('resumoFinal');
    if (!container) return;
    container.innerHTML = "";
    let subtotal = 0;

    carrinho.forEach(item => {
        subtotal += item.preco;
        container.innerHTML += `
            <div class="flex justify-between items-center p-3 bg-slate-50 rounded-2xl mb-1">
                <span class="text-[11px] font-bold text-slate-700">${item.nome}</span>
                <span class="text-[11px] font-black text-brand">R$ ${item.preco.toFixed(2)}</span>
            </div>`;
    });

    const totalGeral = subtotal + taxaEntregaAtual;
    if (totalP1) totalP1.innerHTML = `<div class="flex justify-between items-center p-4 bg-slate-900 rounded-2xl text-white"><span class="text-[9px] font-bold uppercase opacity-60">Total</span><span class="font-black text-lg">R$ ${totalGeral.toFixed(2)}</span></div>`;
    if (resumoF) resumoF.innerHTML = `<div class="space-y-2 text-[11px]"><div class="flex justify-between opacity-70"><span>Subtotal:</span><span>R$ ${subtotal.toFixed(2)}</span></div><div class="flex justify-between opacity-70"><span>Frete:</span><span>R$ ${taxaEntregaAtual.toFixed(2)}</span></div><div class="flex justify-between text-base font-black border-t pt-2"><span>TOTAL:</span><span>R$ ${totalGeral.toFixed(2)}</span></div></div>`;
}

window.abrirCarrinho = () => {
    document.getElementById('modalCarrinho')?.classList.remove('hidden');
    renderizarCarrinho();
};

window.fecharCarrinho = () => document.getElementById('modalCarrinho')?.classList.add('hidden');

window.enviarWhatsApp = async () => {
    const radios = document.getElementsByName('pagamento');
    radios.forEach(r => { if (r.checked) formaPagamento = r.value; });
    if (!formaPagamento) { alert("Selecione o pagamento!"); return; }

    const nomeCliente = document.getElementById('inputNome')?.value || "Cliente";
    const numeroEnd = document.getElementById('inputNumero')?.value || "";
    const subtotal = carrinho.reduce((a, b) => a + b.preco, 0);
    const totalFinal = subtotal + taxaEntregaAtual;

    let numDestino = '55' + whatsappLoja.replace(/\D/g, '');

    const dadosPedido = {
        userId, cliente: nomeCliente, itens: carrinho, total: totalFinal,
        taxaEntrega: taxaEntregaAtual, status: "Pendente", pagamento: formaPagamento,
        tipo: modoPedido, endereco: modoPedido === 'entrega' ? `${enderecoCompleto.rua}, ${numeroEnd}` : 'Retirada',
        createdAt: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "pedidos"), dadosPedido);
        let msg = `*NOVO PEDIDO* 🥐\n*Cliente:* ${nomeCliente}\n`;
        carrinho.forEach(i => msg += `• ${i.nome} - R$ ${i.preco.toFixed(2)}\n`);
        msg += `*Total: R$ ${totalFinal.toFixed(2)}*`;
        window.location.assign(`https://wa.me/${numDestino}?text=${encodeURIComponent(msg)}`);
    } catch (e) { alert("Erro ao salvar pedido."); }
};

// --- INICIALIZAÇÃO ---
async function inicializar() {
    if (!userId) return;
    try {
        const userSnap = await getDoc(doc(db, "usuarios", userId));
        if (userSnap.exists()) {
            const d = userSnap.data();
            whatsappLoja = d.whatsapp || "";
            horariosSemana = d.horarios || {}; // Carrega o mapa de horários da sua imagem
            configEntrega = d.configEntrega;

            document.getElementById('nomeLoja').innerText = d.nomeNegocio || "Loja";
            const imgPerfil = document.getElementById('logoLoja');
            if (d.fotoPerfil && imgPerfil) imgPerfil.src = d.fotoPerfil;
            if (d.corTema) document.documentElement.style.setProperty('--cor-primaria', d.corTema);
            const banner = document.getElementById('bannerLoja');
            if (banner && d.fotoCapa) banner.style.backgroundImage = `url('${d.fotoCapa}')`;

            // Roda a verificação de horário
            verificarStatusLoja();
        }

        const q = query(collection(db, "produtos"), where("userId", "==", userId));
        const snap = await getDocs(q);
        renderizarProdutos(snap);
        document.getElementById('loading-overlay').classList.add('loader-hidden');
    } catch (e) { console.error(e); }
}

function renderizarProdutos(snap) {
    const main = document.getElementById('mainContainer');
    const nav = document.getElementById('navCategorias');
    if (!main || !nav) return;
    const prods = {};
    snap.forEach(doc => {
        const p = doc.data();
        if (!prods[p.categoria]) prods[p.categoria] = [];
        prods[p.categoria].push(p);
    });

    Object.keys(prods).forEach(cat => {
        nav.innerHTML += `<a href="#${cat.replace(/\s/g, '')}" class="category-tab pb-2 whitespace-nowrap font-bold text-xs uppercase">${cat}</a>`;
        let section = `<section id="${cat.replace(/\s/g, '')}" class="pt-4"><h2 class="text-[10px] font-black text-slate-400 uppercase mb-4">${cat}</h2><div class="space-y-3">`;
        prods[cat].forEach(p => {
            section += `
                <div class="bg-white p-3 rounded-3xl flex items-center justify-between shadow-sm">
                    <div class="flex-1 pr-4">
                        <h3 class="text-sm font-bold text-slate-800">${p.nome}</h3>
                        <p class="text-brand font-black mt-2">R$ ${Number(p.preco).toFixed(2)}</p>
                    </div>
                    <div class="relative w-20 h-20">
                        <img src="${p.foto}" class="w-full h-full object-cover rounded-2xl">
                        <button onclick="adicionarAoCarrinho('${p.nome}', ${p.preco})" class="absolute -bottom-1 -right-1 w-8 h-8 bg-brand text-white rounded-xl shadow-lg font-bold">+</button>
                    </div>
                </div>`;
        });
        main.innerHTML += section + `</div></section>`;
    });
}

inicializar();
