import { db } from './firebase-config.js';
import {
    collection,
    query,
    where,
    getDocs,
    doc,
    getDoc,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const userId = params.get('id');

// --- ESTADO GLOBAL ---
let whatsappLoja = "";
let lojaAberta = false;
let horariosSemana = {};
let configEntrega = null;
let carrinho = [];
let taxaEntregaAtual = 0;
let distanciaCliente = 0;
let modoPedido = 'entrega';
let enderecoCompleto = { rua: "", bairro: "", cidade: "", cep: "" };

// --- 🕒 STATUS DA LOJA ---
function atualizarStatusLoja() {
    if (!horariosSemana || Object.keys(horariosSemana).length === 0) return;
    const agora = new Date();
    const diasTraducao = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
    const configHoje = horariosSemana[diasTraducao[agora.getDay()]];
    const horaAtualMinutos = (agora.getHours() * 60) + agora.getMinutes();

    if (!configHoje || !configHoje.aberto) {
        lojaAberta = false;
        renderizarUIStatus(false, "Fechado hoje", null);
        return;
    }

    const [hAbre, mAbre] = configHoje.abre.split(':').map(Number);
    const [hFecha, mFecha] = configHoje.fecha.split(':').map(Number);
    const minAbre = (hAbre * 60) + mAbre;
    const minFecha = (hFecha * 60) + mFecha;

    lojaAberta = (minFecha < minAbre) 
        ? (horaAtualMinutos >= minAbre || horaAtualMinutos <= minFecha)
        : (horaAtualMinutos >= minAbre && horaAtualMinutos <= minFecha);

    renderizarUIStatus(lojaAberta, lojaAberta ? "Aberto" : "Fechado", lojaAberta ? configHoje.fecha : configHoje.abre);
}

function renderizarUIStatus(aberto, texto, hora) {
    const label = document.getElementById('labelStatus');
    const dot = document.getElementById('dotStatus');
    if (!label || !dot) return;
    dot.className = aberto ? "w-2 h-2 rounded-full bg-green-500 ping-aberto" : "w-2 h-2 rounded-full bg-red-500";
    label.innerHTML = aberto 
        ? `<span class="text-green-600 font-bold">Aberto</span> <span class="text-[10px] opacity-60">até ${hora}</span>`
        : `<span class="text-red-600 font-bold">${texto}</span> ${hora ? '• Abre às ' + hora : ''}`;
}

// --- 📍 LOCALIZAÇÃO E FRETE (SISTEMA KM ATIVADO) ---
let timeoutCEP;
window.mascaraCEP = (input) => {
    let v = input.value.replace(/\D/g, '');
    if (v.length > 5) v = v.substring(0, 5) + '-' + v.substring(5, 8);
    input.value = v;
    
    const cepLimpo = v.replace('-', '');
    if (cepLimpo.length === 8) {
        clearTimeout(timeoutCEP);
        timeoutCEP = setTimeout(() => buscarCEP(cepLimpo), 800);
    }
};

async function buscarCEP(cep) {
    const statusCEP = document.getElementById('statusCEP');
    const btnPgto = document.getElementById('btnProximo2');
    
    // 🔑 Sua chave do LocationIQ inserida com sucesso!
    const API_KEY_LOCATIONIQ = "pk.e6ab2789e2668e794d7e2f02f4be127c"; 

    try {
        statusCEP.innerText = "⏳ Localizando endereço...";
        
        const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await resp.json();
        
        if (data.erro) { 
            statusCEP.innerText = "📍 CEP não encontrado"; 
            if(btnPgto) btnPgto.disabled = true;
            return; 
        }

        document.getElementById('camposEndereco').classList.remove('hidden');
        document.getElementById('textoEnderecoAuto').innerText = `${data.logradouro}, ${data.bairro}`;
        enderecoCompleto = { rua: data.logradouro, bairro: data.bairro, cidade: data.localidade, cep: cep };

        statusCEP.innerText = "⏳ Calculando frete por KM...";
        try {
            const geoUrl = `https://us1.locationiq.com/v1/search?key=${API_KEY_LOCATIONIQ}&postalcode=${cep}&country=Brazil&format=json&limit=1`;
            const geo = await fetch(geoUrl);
            
            if (!geo.ok) throw new Error("Erro na API de Geocodificação");

            const geoData = await geo.json();
            
            if (geoData && geoData.length > 0 && configEntrega?.coords) {
                const latLoja = parseFloat(configEntrega.coords.lat);
                const lngLoja = parseFloat(configEntrega.coords.lng || configEntrega.coords.log);
                const latCliente = parseFloat(geoData[0].lat);
                const lngCliente = parseFloat(geoData[0].lon);

                distanciaCliente = calcularDistancia(latLoja, lngLoja, latCliente, lngCliente);
                statusCEP.innerText = `✅ Entrega a ${distanciaCliente.toFixed(1)}km`;
            } else {
                throw new Error("Dados de localização incompletos");
            }
        } catch (mapError) {
            console.warn("Usando taxa fixa (Mapa indisponível):", mapError);
            distanciaCliente = 0; 
            statusCEP.innerText = "✅ Frete padrão aplicado";
        }

        recalcularTaxa();

        if(btnPgto) {
            btnPgto.disabled = false;
            btnPgto.classList.replace('bg-slate-200', 'bg-brand');
        }

    } catch (e) { 
        console.error("Erro crítico:", e);
        statusCEP.innerText = "⚠️ CEP OK. Verifique o frete abaixo.";
        recalcularTaxa();
        if(btnPgto) btnPgto.disabled = false;
    }
}

function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function recalcularTaxa() {
    const subtotal = carrinho.reduce((a, b) => a + b.preco, 0);
    
    if (modoPedido === 'retirada') {
        taxaEntregaAtual = 0;
    } else if (configEntrega?.tipo === 'km' && distanciaCliente > 0) {
        const valorKm = parseFloat(configEntrega.valorKm) || 0;
        taxaEntregaAtual = distanciaCliente * valorKm;
    } else {
        taxaEntregaAtual = parseFloat(configEntrega?.taxaFixa) || 0;
    }
    renderizarCarrinho();
}

window.atualizarModoPedidoJS = (modo) => { 
    modoPedido = modo; 
    distanciaCliente = 0; 
    taxaEntregaAtual = 0; 
    recalcularTaxa(); 
    if (modo === 'retirada') {
        const btnPgto = document.getElementById('btnProximo2');
        if (btnPgto) {
            btnPgto.disabled = false;
            btnPgto.classList.replace('bg-slate-200', 'bg-brand');
        }
    }
};

// --- 🛒 CARRINHO ---
window.adicionarAoCarrinho = (nome, preco) => {
    if (!lojaAberta) { alert("🚫 Loja Fechada no momento!"); return; }
    carrinho.push({ nome, preco: Number(preco) });
    document.getElementById('btnCarrinho').classList.remove('hidden');
    document.getElementById('qtdItensCarrinho').innerText = carrinho.length;
};

window.abrirCarrinho = () => {
    document.getElementById('modalCarrinho').classList.remove('hidden');
    renderizarCarrinho();
};

function renderizarCarrinho() {
    const lista = document.getElementById('listaItensCarrinho');
    const totalP1 = document.getElementById('totalPasso1');
    const resumo = document.getElementById('resumoFinal');
    if (!lista) return;

    let subtotal = 0;
    lista.innerHTML = carrinho.map(item => {
        subtotal += item.preco;
        return `<div class="flex justify-between p-3 bg-white rounded-xl border border-slate-100 text-xs font-bold">
                    <span>${item.nome}</span><span class="text-brand">R$ ${item.preco.toFixed(2)}</span>
                </div>`;
    }).join('');

    if (totalP1) {
        totalP1.innerHTML = `<div class="flex justify-between items-center p-4 bg-slate-900 rounded-2xl text-white">
                                <span class="text-[9px] font-bold uppercase opacity-60">Subtotal</span>
                                <span class="font-black text-lg">R$ ${subtotal.toFixed(2)}</span>
                             </div>`;
    }

    if (resumo) {
        const totalFinal = subtotal + taxaEntregaAtual;
        const textoFrete = (modoPedido === 'entrega' && distanciaCliente > 0) 
            ? `🛵 Entrega (${distanciaCliente.toFixed(1)}km)` 
            : (modoPedido === 'retirada' ? '🛍️ Retirada' : '🛵 Entrega');

        resumo.innerHTML = `
        <div class="space-y-1 text-[11px] font-bold">
            <div class="flex justify-between opacity-60"><span>Subtotal</span><span>R$ ${subtotal.toFixed(2)}</span></div>
            <div class="flex justify-between opacity-60">
                <span>${textoFrete}</span>
                <span>${taxaEntregaAtual > 0 ? 'R$ ' + taxaEntregaAtual.toFixed(2) : 'Grátis'}</span>
            </div>
            <div class="flex justify-between text-base font-black border-t border-white/10 pt-2 mt-2"><span>TOTAL</span><span>R$ ${totalFinal.toFixed(2)}</span></div>
        </div>`;
    }
}

// --- 📤 FINALIZAÇÃO ---
window.enviarWhatsApp = async () => {
    const nome = document.getElementById('inputNome').value;
    const whats = document.getElementById('inputWhatsApp').value;
    const pag = document.querySelector('input[name="pagamento"]:checked')?.value;
    const num = document.getElementById('inputNumero').value;

    if (!nome || !pag) { alert("⚠️ Preencha nome e forma de pagamento!"); return; }

    const subtotal = carrinho.reduce((a, b) => a + b.preco, 0);
    const total = subtotal + taxaEntregaAtual;
    
    try {
        const pedido = {
            userId, cliente: nome, whatsapp: whats, itens: carrinho, 
            total, taxa: taxaEntregaAtual, tipo: modoPedido,
            endereco: modoPedido === 'entrega' ? `${enderecoCompleto.rua}, ${num}` : 'Retirada',
            pagamento: pag, createdAt: serverTimestamp()
        };
        await addDoc(collection(db, "pedidos"), pedido);
        
        let msg = `*NOVO PEDIDO*\n*Cliente:* ${nome}\n*Tipo:* ${modoPedido}\n`;
        carrinho.forEach(i => msg += `• ${i.nome}\n`);
        if(modoPedido === 'entrega') msg += `*Endereço:* ${enderecoCompleto.rua}, ${num}\n*Frete:* R$ ${taxaEntregaAtual.toFixed(2)}\n`;
        msg += `*Total:* R$ ${total.toFixed(2)}\n*Pagamento:* ${pag}`;
        
        window.open(`https://wa.me/55${whatsappLoja.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`);
    } catch (e) { alert("Erro ao processar pedido."); }
};

// --- 🚀 INICIALIZAÇÃO ---
async function inicializar() {
    if (!userId) return;
    try {
        const userSnap = await getDoc(doc(db, "usuarios", userId));
        if (userSnap.exists()) {
            const d = userSnap.data();
            whatsappLoja = d.whatsapp || "";
            horariosSemana = d.horarios || {};
            configEntrega = d.configEntrega;
            document.getElementById('nomeLoja').innerText = d.nomeNegocio || "Loja";
            document.getElementById('nomeLojaRodape').innerText = d.nomeNegocio || "Loja";
            if (d.corTema) document.documentElement.style.setProperty('--cor-primaria', d.corTema);
            if (d.fotoPerfil) {
                const img = document.getElementById('logoLoja');
                img.src = d.fotoPerfil; img.classList.remove('hidden');
            }
            if (d.fotoCapa) document.getElementById('bannerLoja').style.backgroundImage = `url('${d.fotoCapa}')`;
            atualizarStatusLoja();
        }
        const q = query(collection(db, "produtos"), where("userId", "==", userId));
        const snap = await getDocs(q);
        renderizarProdutos(snap);
    } catch (e) { console.error(e); }
    finally { document.getElementById('loading-overlay').classList.add('loader-hidden'); }
}

function renderizarProdutos(snap) {
    const main = document.getElementById('mainContainer');
    const nav = document.getElementById('navCategorias');
    const cats = {};
    snap.forEach(d => {
        const p = d.data();
        if (!cats[p.categoria]) cats[p.categoria] = [];
        cats[p.categoria].push(p);
    });
    Object.keys(cats).forEach(c => {
        const id = c.replace(/\s/g, '');
        nav.innerHTML += `<a href="#${id}" class="category-tab">${c}</a>`;
        let sect = `<section id="${id}"><h2 class="text-[10px] font-black text-slate-400 uppercase mb-4">${c}</h2><div class="space-y-3">`;
        cats[c].forEach(p => {
            sect += `
                <div class="bg-white p-3 rounded-3xl flex items-center justify-between shadow-sm border border-slate-50">
                    <div class="flex-1 pr-4">
                        <h3 class="text-sm font-bold text-slate-800">${p.nome}</h3>
                        <p class="text-brand font-black mt-2">R$ ${Number(p.preco).toFixed(2)}</p>
                    </div>
                    <div class="relative w-20 h-20 shrink-0">
                        <img src="${p.foto}" class="w-full h-full object-cover rounded-2xl shadow-inner bg-slate-100">
                        <button onclick="adicionarAoCarrinho('${p.nome}', ${p.preco})" class="absolute -bottom-1 -right-1 w-8 h-8 bg-brand text-white rounded-xl shadow-lg flex items-center justify-center font-bold">+</button>
                    </div>
                </div>`;
        });
        main.innerHTML += sect + `</div></section>`;
    });
}

inicializar();
