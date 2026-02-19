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
let lojaAberta = true;
let horariosSemana = {}; // Armazenará os horários de cada dia
let configEntrega = null;

// --- ESTADO GLOBAL DO PEDIDO ---
let carrinho = [];
let taxaEntregaAtual = 0;
let distanciaCliente = 0;
let modoPedido = 'entrega';
let formaPagamento = '';
let enderecoCompleto = { rua: "", bairro: "", cidade: "", cep: "" };
let clienteLogado = null;

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

// --- LÓGICA DE STATUS EM TEMPO REAL ---
function atualizarStatusLoja() {
    const agora = new Date();
    const diaSemana = agora.getDay(); // 0-6 (Dom-Sab)
    const horaMinutoAtual = agora.getHours() * 60 + agora.getMinutes();
    
    // Busca o horário do dia atual no objeto vindo do Firebase
    const configHoje = horariosSemana[diaSemana];

    const labelStatus = document.getElementById('labelStatus');
    const dotStatus = document.getElementById('dotStatus');

    if (!configHoje || !configHoje.aberto || !configHoje.inicio || !configHoje.fim) {
        lojaAberta = false;
        if (dotStatus) dotStatus.className = "w-2 h-2 rounded-full bg-red-500";
        if (labelStatus) labelStatus.innerHTML = `<span class="text-red-600 font-bold">Fechado hoje</span>`;
        return;
    }

    const [hAbre, mAbre] = configHoje.inicio.split(':').map(Number);
    const [hFecha, mFecha] = configHoje.fim.split(':').map(Number);
    const minAbre = hAbre * 60 + mAbre;
    const minFecha = hFecha * 60 + mFecha;

    // Lógica para horários que atravessam a meia-noite
    if (minFecha < minAbre) {
        lojaAberta = (horaMinutoAtual >= minAbre || horaMinutoAtual <= minFecha);
    } else {
        lojaAberta = (horaMinutoAtual >= minAbre && horaMinutoAtual <= minFecha);
    }

    if (lojaAberta) {
        if (dotStatus) dotStatus.className = "w-2 h-2 rounded-full bg-green-500 ping-aberto";
        if (labelStatus) labelStatus.innerHTML = `<span class="text-green-600 font-bold">Aberto</span> até ${configHoje.fim}`;
    } else {
        if (dotStatus) dotStatus.className = "w-2 h-2 rounded-full bg-red-500";
        if (labelStatus) labelStatus.innerHTML = `<span class="text-red-600 font-bold">Fechado</span> • Abre às ${configHoje.inicio}`;
    }
}

// Inicia um intervalo para verificar o status a cada 30 segundos sem recarregar a página
setInterval(atualizarStatusLoja, 30000);

// --- LÓGICA DE CEP E CLIENTE ---
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
    const status = document.getElementById('statusCEP');
    const btnProx2 = document.getElementById('btnProximo2');
    const camposEndereco = document.getElementById('camposEndereco');
    const textoEnderecoAuto = document.getElementById('textoEnderecoAuto');

    if (!cepInput) return;
    const cep = cepInput.value.replace(/\D/g, '');
    if (cep.length !== 8) return;

    cepInput.classList.add('animate-pulse');

    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();
        if (data.erro) {
            if (status) status.innerText = "CEP não encontrado!";
            return;
        }

        if (camposEndereco) camposEndereco.classList.remove('hidden');
        if (textoEnderecoAuto) textoEnderecoAuto.innerText = `${data.logradouro}, ${data.bairro} - ${data.localidade}/${data.uf}`;

        enderecoCompleto = { rua: data.logradouro || "", bairro: data.bairro || "", cidade: data.localidade || "", cep: cep };

        const geoResp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&postalcode=${cep}&country=Brazil`, {
            headers: { 'User-Agent': `CardapioVacy_${userId}` }
        });
        const geoData = await geoResp.json();

        if (geoData.length > 0) {
            const dist = calcularDistancia(
                parseFloat(configEntrega.coords.lat),
                parseFloat(configEntrega.coords.log || configEntrega.coords.lng),
                parseFloat(geoData[0].lat),
                parseFloat(geoData[0].lon)
            );

            if (configEntrega.raioMaximo > 0 && dist > configEntrega.raioMaximo) {
                alert(`Não entregamos nesta distância (${dist.toFixed(1)}km).`);
                if (btnProx2) btnProx2.disabled = true;
            } else {
                distanciaCliente = dist;
                recalcularTaxaEntrega();
                if (btnProx2) {
                    btnProx2.disabled = false;
                    btnProx2.classList.replace('bg-slate-200', 'bg-brand');
                }
            }
        }
    } catch (e) { console.error(e); } finally {
        cepInput.classList.remove('animate-pulse');
        renderizarCarrinho();
    }
};

function recalcularTaxaEntrega() {
    if (modoPedido === 'retirada') taxaEntregaAtual = 0;
    else if (configEntrega?.tipo === 'km') taxaEntregaAtual = parseFloat((distanciaCliente * configEntrega.valorKm).toFixed(2));
    else taxaEntregaAtual = Number(configEntrega?.taxaFixa) || 0;
    renderizarCarrinho();
}

window.atualizarModoPedidoJS = (modo) => {
    modoPedido = modo;
    recalcularTaxaEntrega();
    const btn = document.getElementById('btnProximo1');
    if (btn) { btn.disabled = false; btn.classList.replace('bg-slate-200', 'bg-brand'); }
};

// --- CARRINHO ---
window.adicionarAoCarrinho = (nome, preco) => {
    if (!lojaAberta) { alert("Loja Fechada no momento!"); return; }
    carrinho.push({ nome, preco: Number(preco) });
    atualizarBadgeCarrinho();
};

function atualizarBadgeCarrinho() {
    const btn = document.getElementById('btnCarrinho');
    const badge = document.getElementById('qtdItensCarrinho');
    if (carrinho.length > 0) {
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
        container.innerHTML += `<div class="flex justify-between items-center p-3 bg-slate-50 rounded-2xl mb-1">
            <span class="text-[11px] font-bold text-slate-700">${item.nome}</span>
            <span class="text-[11px] font-black text-brand">R$ ${item.preco.toFixed(2)}</span>
        </div>`;
    });
    const total = subtotal + taxaEntregaAtual;
    if (totalP1) totalP1.innerHTML = `<div class="flex justify-between items-center p-4 bg-slate-900 rounded-2xl text-white"><span class="text-[9px] font-bold uppercase opacity-60 italic">Total</span><span class="font-black text-lg">R$ ${total.toFixed(2)}</span></div>`;
    if (resumoF) resumoF.innerHTML = `<div class="space-y-2 text-[11px]"><div class="flex justify-between opacity-70"><span>Subtotal:</span><span>R$ ${subtotal.toFixed(2)}</span></div><div class="flex justify-between opacity-70"><span>Frete:</span><span>${taxaEntregaAtual > 0 ? 'R$ ' + taxaEntregaAtual.toFixed(2) : 'Grátis'}</span></div><div class="flex justify-between text-base font-black border-t border-white/20 pt-2 mt-2"><span>TOTAL:</span><span>R$ ${total.toFixed(2)}</span></div></div>`;
}

// --- FINALIZAÇÃO ---
window.enviarWhatsApp = async () => {
    const forma = document.querySelector('input[name="pagamento"]:checked')?.value;
    if (!forma) { alert("Selecione o pagamento!"); return; }
    const nome = document.getElementById('inputNome')?.value || "Cliente";
    const num = document.getElementById('inputNumero')?.value || "";
    if (modoPedido === 'entrega' && !num) { alert("Informe o número."); return; }

    const subtotal = carrinho.reduce((a, b) => a + b.preco, 0);
    const total = subtotal + taxaEntregaAtual;
    const end = modoPedido === 'entrega' ? `${enderecoCompleto.rua}, ${num} - ${enderecoCompleto.bairro}` : 'Retirada';

    try {
        await addDoc(collection(db, "pedidos"), {
            userId, cliente: nome, itens: carrinho, total, taxaEntrega: taxaEntregaAtual, status: "Pendente", pagamento: forma, tipo: modoPedido, endereco: end, createdAt: serverTimestamp()
        });
        
        let msg = `*NOVO PEDIDO ONLINE*\n*Cliente:* ${nome}\n------------------\n`;
        carrinho.forEach(i => msg += `• ${i.nome} - R$ ${i.preco.toFixed(2)}\n`);
        msg += `------------------\n*Modo:* ${modoPedido}\n*Endereço:* ${end}\n*Pagamento:* ${forma}\n*TOTAL: R$ ${total.toFixed(2)}*`;

        window.location.assign(`https://wa.me/55${whatsappLoja.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`);
        carrinho = []; renderizarCarrinho();
    } catch (e) { alert("Erro ao salvar pedido"); }
};

// --- INICIALIZAÇÃO ---
async function inicializar() {
    if (!userId) return;
    try {
        const userSnap = await getDoc(doc(db, "usuarios", userId));
        if (userSnap.exists()) {
            const d = userSnap.data();
            whatsappLoja = d.whatsapp || "";
            // Pega o objeto de horários (deve ser um mapa com chaves 0, 1, 2, 3, 4, 5, 6)
            horariosSemana = d.horarios || {}; 
            configEntrega = d.configEntrega || { coords: { lat: 0, log: 0 }, raioMaximo: 0, valorKm: 0, tipo: 'fixo' };

            document.getElementById('nomeLoja').innerText = d.nomeNegocio || "Loja";
            const img = document.getElementById('logoLoja');
            if (d.fotoPerfil && img) { img.src = d.fotoPerfil; img.classList.remove('hidden'); }
            if (d.corTema) document.documentElement.style.setProperty('--cor-primaria', d.corTema);
            
            atualizarStatusLoja();
        }

        const q = query(collection(db, "produtos"), where("userId", "==", userId));
        const snap = await getDocs(q);
        const main = document.getElementById('mainContainer');
        const nav = document.getElementById('navCategorias');
        if (main && nav) {
            main.innerHTML = ""; nav.innerHTML = "";
            const prods = {};
            snap.forEach(doc => {
                const p = doc.data();
                if (!prods[p.categoria]) prods[p.categoria] = [];
                prods[p.categoria].push(p);
            });
            Object.keys(prods).forEach(cat => {
                nav.innerHTML += `<a href="#${cat.replace(/\s/g, '')}" class="category-tab font-bold text-xs uppercase">${cat}</a>`;
                let s = `<section id="${cat.replace(/\s/g, '')}" class="pt-4"><h2 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">${cat}</h2><div class="space-y-3">`;
                prods[cat].forEach(p => {
                    s += `<div class="bg-white p-3 rounded-3xl flex items-center justify-between shadow-sm border border-slate-50">
                        <div class="flex-1 pr-4">
                            <h3 class="text-sm font-bold text-slate-800">${p.nome}</h3>
                            <p class="text-[10px] text-slate-400 mt-0.5">${p.descricao || ''}</p>
                            <p class="text-brand font-black mt-2">R$ ${Number(p.preco).toFixed(2)}</p>
                        </div>
                        <div class="relative w-20 h-20">
                            <img src="${p.foto}" class="w-full h-full object-cover rounded-2xl">
                            <button onclick="adicionarAoCarrinho('${p.nome}', ${p.preco})" class="absolute -bottom-1 -right-1 w-8 h-8 bg-brand text-white rounded-xl shadow-lg font-bold">+</button>
                        </div>
                    </div>`;
                });
                main.innerHTML += s + `</div></section>`;
            });
        }
        document.getElementById('loading-overlay').classList.add('loader-hidden');
    } catch (e) { console.error(e); }
}

inicializar();
