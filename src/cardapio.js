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

// --- PARÂMETROS E CONFIGURAÇÕES ---
const params = new URLSearchParams(window.location.search);
const userId = params.get('id');

let whatsappLoja = ""; 
let lojaAberta = true; 
let configHorario = { abertura: "", fechamento: "" };
let configEntrega = { coords: {lat:0, lng:0}, raioMaximo: 0, valorKm: 0, tipo: 'fixo' }; 

// --- ESTADO GLOBAL ---
let carrinho = []; 
let taxaEntregaAtual = 0;
let distanciaCliente = 0; 
let modoPedido = 'entrega'; 
let formaPagamento = '';
let enderecoCompleto = { rua: "", bairro: "", cidade: "", cep: "" };
let clienteLogado = null;

const formatarMoeda = (valor) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// --- CÁLCULO DE DISTÂNCIA ---
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

// --- CEP E FRETE ---
window.buscarCEP = async () => {
    const cepInput = document.getElementById('inputCEP');
    const status = document.getElementById('statusCEP');
    const btnProx2 = document.getElementById('btnProximo2');
    if (!cepInput) return;

    const cep = cepInput.value.replace(/\D/g, '');
    if (cep.length !== 8) return;

    if (status) status.innerText = "Calculando frete...";
    
    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();
        if (data.erro) throw new Error("CEP inexistente");

        enderecoCompleto = { rua: data.logradouro, bairro: data.bairro, cidade: data.localidade, cep: cep };
        
        // Exibe campos de endereço
        document.getElementById('camposEndereco')?.classList.remove('hidden');
        if(document.getElementById('textoEnderecoAuto')) {
            document.getElementById('textoEnderecoAuto').innerText = `${data.logradouro}, ${data.bairro}`;
        }

        // Busca Geo para distância
        const geoResp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&postalcode=${cep}&country=Brazil`);
        const geoData = await geoResp.json();

        if (geoData.length > 0 && configEntrega.coords.lat !== 0) {
            const dist = calcularDistancia(
                configEntrega.coords.lat, 
                configEntrega.coords.lng || configEntrega.coords.log, 
                parseFloat(geoData[0].lat), 
                parseFloat(geoData[0].lon)
            );
            distanciaCliente = dist;
            recalcularTaxaEntrega();
            if (status) status.innerHTML = `<span class="text-green-500 font-bold">Frete OK!</span>`;
        }
    } catch (e) {
        if (status) status.innerText = "Erro ao buscar CEP.";
    }
};

function recalcularTaxaEntrega() {
    if (modoPedido === 'retirada') {
        taxaEntregaAtual = 0;
    } else {
        taxaEntregaAtual = configEntrega.tipo === 'km' ? 
            (distanciaCliente * configEntrega.valorKm) : (Number(configEntrega.taxaFixa) || 0);
    }
    renderizarCarrinho();
}

// --- CARRINHO ---
window.adicionarAoCarrinho = (nome, preco) => {
    if(!lojaAberta) return alert("Loja Fechada!");
    const item = carrinho.find(i => i.nome === nome);
    item ? item.qtd++ : carrinho.push({ nome, preco: Number(preco), qtd: 1 });
    atualizarBadgeCarrinho();
};

function atualizarBadgeCarrinho() {
    const btn = document.getElementById('btnCarrinho');
    const badge = document.getElementById('qtdItensCarrinho');
    if (carrinho.length > 0) {
        btn?.classList.remove('hidden');
        if(badge) badge.innerText = carrinho.reduce((acc, i) => acc + i.qtd, 0);
    } else {
        btn?.classList.add('hidden');
    }
}

function renderizarCarrinho() {
    const container = document.getElementById('listaItensCarrinho');
    if(!container) return;
    container.innerHTML = "";
    let subtotal = 0;

    carrinho.forEach((item, index) => {
        subtotal += (item.preco * item.qtd);
        container.innerHTML += `
            <div class="flex justify-between items-center p-3 border-b border-slate-100">
                <span class="text-xs font-bold">${item.qtd}x ${item.nome}</span>
                <div class="flex items-center gap-2">
                    <span class="text-xs">${formatarMoeda(item.preco * item.qtd)}</span>
                    <button onclick="window.removerItem(${index})" class="text-red-500 font-bold">X</button>
                </div>
            </div>`;
    });

    const total = subtotal + taxaEntregaAtual;
    document.getElementById('totalPasso1').innerHTML = `<div class="p-4 bg-slate-900 rounded-2xl text-white flex justify-between font-bold"><span>Total</span><span>${formatarMoeda(total)}</span></div>`;
    
    if(document.getElementById('resumoFinal')) {
        document.getElementById('resumoFinal').innerHTML = `
            <div class="text-xs space-y-1">
                <div class="flex justify-between"><span>Subtotal:</span><span>${formatarMoeda(subtotal)}</span></div>
                <div class="flex justify-between"><span>Entrega:</span><span>${taxaEntregaAtual > 0 ? formatarMoeda(taxaEntregaAtual) : 'Grátis'}</span></div>
                <div class="flex justify-between font-black text-lg pt-2"><span>TOTAL:</span><span>${formatarMoeda(total)}</span></div>
            </div>`;
    }
}

window.removerItem = (index) => {
    carrinho[index].qtd > 1 ? carrinho[index].qtd-- : carrinho.splice(index, 1);
    renderizarCarrinho();
    atualizarBadgeCarrinho();
};

// --- INICIALIZAÇÃO (O CORAÇÃO DO SCRIPT) ---
async function inicializar() {
    const loader = document.getElementById('loading-overlay');
    
    if (!userId) {
        alert("ID da loja não encontrado na URL!");
        if(loader) loader.innerHTML = "ID da loja não fornecido.";
        return;
    }

    try {
        // 1. Carrega dados do Usuário/Loja
        const userSnap = await getDoc(doc(db, "usuarios", userId));
        if (userSnap.exists()) {
            const d = userSnap.data();
            whatsappLoja = d.whatsapp || "";
            configEntrega = d.configEntrega || configEntrega;
            
            document.getElementById('nomeLoja').innerText = d.nomeNegocio || "Cardápio Digital";
            if(d.fotoPerfil) document.getElementById('logoLoja').src = d.fotoPerfil;
            if(d.fotoCapa) document.getElementById('bannerLoja').style.backgroundImage = `url('${d.fotoCapa}')`;
            
            // Verifica status
            lojaAberta = verificarSeEstaAberto(d.horarioAbertura, d.horarioFechamento);
            const labelStatus = document.getElementById('labelStatus');
            if(labelStatus) labelStatus.innerHTML = lojaAberta ? 
                `<span class="text-green-600 font-black">Aberto agora</span>` : 
                `<span class="text-red-600 font-black">Fechado no momento</span>`;
        }

        // 2. Carrega Produtos
        const q = query(collection(db, "produtos"), where("userId", "==", userId));
        const snap = await getDocs(q);
        const prods = {};
        
        snap.forEach(doc => {
            const p = doc.data();
            if(!prods[p.categoria]) prods[p.categoria] = [];
            prods[p.categoria].push(p);
        });

        const main = document.getElementById('mainContainer');
        const nav = document.getElementById('navCategorias');
        
        if(main && Object.keys(prods).length > 0) {
            main.innerHTML = ""; nav.innerHTML = "";
            Object.keys(prods).forEach(cat => {
                const catId = cat.replace(/\s/g, '');
                nav.innerHTML += `<a href="#${catId}" class="category-tab">${cat}</a>`;
                
                let section = `<section id="${catId}" class="pt-6"><h2 class="text-xs font-black text-slate-400 uppercase mb-4">${cat}</h2><div class="grid gap-4">`;
                prods[cat].forEach(p => {
                    section += `
                        <div class="bg-white p-3 rounded-3xl flex items-center justify-between shadow-sm border border-slate-50">
                            <div class="flex-1 pr-4">
                                <h3 class="text-sm font-bold text-slate-800">${p.nome}</h3>
                                <p class="text-[10px] text-slate-400 line-clamp-2">${p.descricao || ''}</p>
                                <p class="text-brand font-black mt-2">${formatarMoeda(Number(p.preco))}</p>
                            </div>
                            <div class="relative w-20 h-20 shrink-0">
                                <img src="${p.foto}" class="w-full h-full object-cover rounded-2xl">
                                <button onclick="adicionarAoCarrinho('${p.nome}', ${p.preco})" class="absolute -bottom-1 -right-1 w-8 h-8 bg-brand text-white rounded-xl shadow-lg">+</button>
                            </div>
                        </div>`;
                });
                main.innerHTML += section + `</div></section>`;
            });
        } else if(main) {
            main.innerHTML = `<div class="p-10 text-center opacity-50">Nenhum produto cadastrado.</div>`;
        }

    } catch (e) {
        console.error("Erro na inicialização:", e);
    } finally {
        // ESSENCIAL: Remove o carregamento aconteça o que acontecer
        if(loader) loader.classList.add('loader-hidden');
        if(typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function verificarSeEstaAberto(abre, fecha) {
    if(!abre || !fecha) return true;
    const agora = new Date();
    const minAtual = agora.getHours() * 60 + agora.getMinutes();
    const converter = (h) => h.split(':').map(Number)[0] * 60 + h.split(':').map(Number)[1];
    const minAbre = converter(abre);
    const minFecha = converter(fecha);
    return minFecha < minAbre ? (minAtual >= minAbre || minAtual <= minFecha) : (minAtual >= minAbre && minAtual <= minFecha);
}

// Inicia o processo
inicializar();
