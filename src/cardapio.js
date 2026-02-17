import { db } from './firebase-config.js'; 
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const userId = params.get('id');
let whatsappLoja = ""; 
let lojaAberta = true; 
let configHorario = { abertura: "", fechamento: "" };
let configEntrega = null; 

// --- SISTEMA DE CARRINHO ---
let carrinho = [];
let taxaEntregaAtual = 0;
let distanciaCliente = 0; 

// --- FUNÇÃO: CÁLCULO DE DISTÂNCIA (HAVERSINE) ---
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

// --- ANIMAÇÃO DE LOADING ---
function iniciarAnimacaoLoading() {
    const emojis = ["🍞", "🎂", "🥐", "🍩", "🍕", "🍔"];
    let index = 0;
    const emojiElement = document.querySelector('#loading-overlay .absolute.inset-0');
    const interval = setInterval(() => {
        const loader = document.getElementById('loading-overlay');
        if (loader && loader.classList.contains('loader-hidden')) {
            clearInterval(interval);
            return;
        }
        index = (index + 1) % emojis.length;
        if (emojiElement) emojiElement.innerText = emojis[index];
    }, 500);
}

function verificarSeEstaAberto(abertura, fechamento) {
    if (!abertura || !fechamento) return true;
    const agora = new Date();
    const horaAtual = agora.getHours() * 60 + agora.getMinutes();
    const [hAbre, mAbre] = abertura.split(':').map(Number);
    const [hFecha, mFecha] = fechamento.split(':').map(Number);
    const minAbre = hAbre * 60 + mAbre;
    const minFecha = hFecha * 60 + mFecha;
    if (minFecha < minAbre) return horaAtual >= minAbre || horaAtual <= minFecha;
    return horaAtual >= minAbre && horaAtual <= minFecha;
}

async function inicializar() {
    if (!userId) return;
    iniciarAnimacaoLoading();

    try {
        const userSnap = await getDoc(doc(db, "usuarios", userId));
        if (userSnap.exists()) {
            const d = userSnap.data();
            whatsappLoja = d.whatsapp || "";
            configHorario.abertura = d.horarioAbertura || "";
            configHorario.fechamento = d.horarioFechamento || "";
            configEntrega = d.configEntrega || { tipo: 'fixo', taxaFixa: 0 };

            // Se for taxa fixa, já define o valor global aqui
            if (configEntrega.tipo === 'fixo') {
                taxaEntregaAtual = Number(configEntrega.taxaFixa) || 0;
            }

            document.getElementById('nomeLoja').innerText = d.nomeNegocio || "Minha Loja";
            const rodapeNome = document.getElementById('nomeLojaRodape');
            if (rodapeNome) rodapeNome.innerText = d.nomeNegocio || "Minha Loja";

            const bannerLoja = document.getElementById('bannerLoja');
            if (bannerLoja) {
                if (d.fotoCapa) bannerLoja.style.backgroundImage = `url('${d.fotoCapa}')`;
                else if (d.corTema) bannerLoja.style.backgroundColor = d.corTema;
                bannerLoja.classList.remove('bg-slate-200');
            }
            if(d.corTema) document.documentElement.style.setProperty('--cor-primaria', d.corTema);
            
            if(d.fotoPerfil) {
                const img = document.getElementById('fotoLoja');
                img.src = d.fotoPerfil;
                img.classList.remove('hidden');
                document.getElementById('emojiLoja').classList.add('hidden');
            }

            const dotStatus = document.getElementById('dotStatus');
            const labelStatus = document.getElementById('labelStatus');
            lojaAberta = verificarSeEstaAberto(d.horarioAbertura, d.horarioFechamento);
            if (lojaAberta) {
                dotStatus.className = "w-2 h-2 rounded-full bg-green-500 ping-aberto";
                labelStatus.innerHTML = `<span class="text-green-600 font-bold">Aberto</span> ${d.horarioFechamento ? '• até ' + d.horarioFechamento : ''}`;
            } else {
                dotStatus.className = "w-2 h-2 rounded-full bg-red-500";
                labelStatus.innerHTML = `<span class="text-red-600 font-bold">Fechado</span> ${d.horarioAbertura ? '• abre às ' + d.horarioAbertura : ''}`;
            }
        }

        const q = query(collection(db, "produtos"), where("userId", "==", userId));
        const snap = await getDocs(q);
        const prods = {};
        snap.forEach(doc => {
            const p = doc.data();
            if(!prods[p.categoria]) prods[p.categoria] = [];
            prods[p.categoria].push(p);
        });

        const nav = document.getElementById('navCategorias');
        const main = document.getElementById('mainContainer');
        main.innerHTML = ""; nav.innerHTML = "";

        Object.keys(prods).forEach((cat, i) => {
            const link = document.createElement('a');
            link.href = `#${cat.replace(/\s/g, '')}`;
            link.className = `category-tab pb-2 whitespace-nowrap font-bold text-xs uppercase transition-all ${i === 0 ? 'active' : ''}`;
            link.innerText = cat;
            nav.appendChild(link);

            const section = document.createElement('section');
            section.id = cat.replace(/\s/g, '');
            section.className = "pt-4";
            section.innerHTML = `<h2 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">${cat}</h2>`;
            
            const list = document.createElement('div');
            list.className = "space-y-3";
            prods[cat].forEach(p => {
                const precoNum = Number(p.preco);
                list.innerHTML += `
                    <div class="bg-white p-3 rounded-3xl flex items-center justify-between shadow-sm border border-slate-50">
                        <div class="flex-1 pr-4">
                            <h3 class="text-sm font-bold text-slate-800">${p.nome}</h3>
                            <p class="text-[10px] text-slate-400 mt-0.5 line-clamp-2">${p.descricao || ''}</p>
                            <p class="text-brand font-black mt-2">R$ ${precoNum.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                        </div>
                        <div class="relative w-20 h-20">
                            <img src="${p.foto || ''}" class="w-full h-full object-cover rounded-2xl bg-slate-50">
                            <button onclick="adicionarAoCarrinho('${p.nome}', ${precoNum})" class="absolute -bottom-1 -right-1 w-8 h-8 bg-brand text-white rounded-xl shadow-lg font-bold text-lg">+</button>
                        </div>
                    </div>`;
            });
            section.appendChild(list);
            main.appendChild(section);
        });

        const loader = document.getElementById('loading-overlay');
        if (loader) {
            loader.classList.add('loader-hidden');
            setTimeout(() => loader.style.display = 'none', 500);
        }
    } catch (e) { console.error(e); }
}

// --- LOGICA DE ENTREGA ---
window.obterLocalizacaoECalcularFrete = () => {
    if (!configEntrega || configEntrega.tipo === 'fixo') return;

    if (navigator.geolocation) {
        const btnGps = document.getElementById('btnCalcularFrete');
        if(btnGps) {
            btnGps.innerText = "⏳ Localizando...";
            btnGps.disabled = true;
        }

        navigator.geolocation.getCurrentPosition((pos) => {
            const distancia = calcularDistancia(
                configEntrega.coords.lat,
                configEntrega.coords.log,
                pos.coords.latitude,
                pos.coords.longitude
            );

            if (distancia > configEntrega.raioMaximo) {
                alert(`Ops! Você está a ${distancia.toFixed(1)}km, nosso limite de entrega é ${configEntrega.raioMaximo}km.`);
                taxaEntregaAtual = 0;
                distanciaCliente = 0;
                if(btnGps) btnGps.innerText = "📍 Fora do Raio de Entrega";
            } else {
                distanciaCliente = distancia;
                taxaEntregaAtual = distancia * configEntrega.valorKm;
                if(btnGps) {
                    btnGps.innerText = "✅ Frete Calculado";
                    btnGps.classList.add('bg-green-50', 'text-green-600', 'border-green-200');
                }
            }
            renderizarCarrinho();
            if(btnGps) btnGps.disabled = false;
        }, () => {
            alert("Não conseguimos acessar seu GPS. Verifique se a localização está ativa no seu celular.");
            if(btnGps) {
                btnGps.innerText = "📍 Tentar Novamente";
                btnGps.disabled = false;
            }
        }, { enableHighAccuracy: true });
    }
};

window.adicionarAoCarrinho = (nome, preco) => {
    if(!verificarSeEstaAberto(configHorario.abertura, configHorario.fechamento)) {
        alert("Loja Fechada!"); return;
    }
    carrinho.push({ nome, preco });
    atualizarBadgeCarrinho();
};

function atualizarBadgeCarrinho() {
    const btn = document.getElementById('btnCarrinho');
    const badge = document.getElementById('qtdItensCarrinho');
    if (carrinho.length > 0) {
        btn.classList.remove('hidden');
        badge.innerText = carrinho.length;
    }
}

function renderizarCarrinho() {
    const container = document.getElementById('listaItensCarrinho');
    const totalElement = document.getElementById('totalCarrinho');
    container.innerHTML = "";
    let subtotal = 0;

    carrinho.forEach(item => {
        subtotal += item.preco;
        container.innerHTML += `
            <div class="flex justify-between p-3 bg-slate-50 rounded-2xl mb-2">
                <span class="text-xs font-bold">${item.nome}</span>
                <span class="text-xs font-black">R$ ${item.preco.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>`;
    });

    const totalGeral = subtotal + taxaEntregaAtual;
    
    totalElement.innerHTML = `
        <div class="space-y-1 border-t border-dashed border-slate-200 pt-3 mt-3">
            <div class="text-slate-500 text-[10px] flex justify-between px-1">
                <span>Subtotal</span>
                <span>R$ ${subtotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
            <div class="text-slate-500 text-[10px] flex justify-between px-1">
                <span>Taxa de Entrega</span>
                <span class="${(distanciaCliente === 0 && configEntrega.tipo === 'raio') ? 'text-red-500 font-bold' : ''}">
                    ${taxaEntregaAtual > 0 ? 'R$ ' + taxaEntregaAtual.toLocaleString('pt-BR', {minimumFractionDigits: 2}) : (configEntrega.tipo === 'fixo' ? 'R$ 0,00' : 'Calcule acima ↓')}
                </span>
            </div>
            <div class="flex justify-between items-center pt-2 px-1">
                <span class="text-sm font-extrabold text-slate-800">Total</span>
                <span class="text-lg font-black text-brand">R$ ${totalGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
        </div>
    `;
}

window.abrirCarrinho = () => {
    const modal = document.getElementById('modalCarrinho');
    const btnGps = document.getElementById('btnCalcularFrete');
    
    if (configEntrega && configEntrega.tipo === 'fixo') {
        if(btnGps) btnGps.classList.add('hidden');
    } else {
        if(btnGps) btnGps.classList.remove('hidden');
    }

    modal.classList.remove('hidden');
    renderizarCarrinho();
};

window.fecharCarrinho = () => {
    document.getElementById('modalCarrinho').classList.add('hidden');
};

window.enviarWhatsApp = () => {
    // VALIDAÇÃO CORRIGIDA: No modo raio, só passa se a distância for maior que 0
    if(configEntrega.tipo === 'raio' && distanciaCliente === 0) {
        alert("Por favor, clique em 'Calcular Frete' para prosseguir!");
        return;
    }

    if(carrinho.length === 0) return;

    let texto = `*NOVO PEDIDO* 🛒\n--------------------------\n`;
    carrinho.forEach(i => texto += `• ${i.nome} (R$ ${i.preco.toFixed(2)})\n`);
    
    const subtotal = carrinho.reduce((a,b) => a + b.preco, 0);
    texto += `--------------------------\n`;
    texto += `*Subtotal:* R$ ${subtotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}\n`;
    texto += `*Frete:* R$ ${taxaEntregaAtual.toLocaleString('pt-BR', {minimumFractionDigits: 2})} ${distanciaCliente > 0 ? '('+distanciaCliente.toFixed(1)+'km)' : ''}\n`;
    texto += `*TOTAL: R$ ${(subtotal + taxaEntregaAtual).toLocaleString('pt-BR', {minimumFractionDigits: 2})}*\n`;
    
    window.open(`https://wa.me/${whatsappLoja.replace(/\D/g,'')}?text=${encodeURIComponent(texto)}`);
};

inicializar();