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
let configHorario = { abertura: "", fechamento: "" };
let configEntrega = null;

// --- ESTADO GLOBAL DO PEDIDO ---
let carrinho = [];
let taxaEntregaAtual = 0;
let distanciaCliente = 0;
let modoPedido = 'entrega';
let formaPagamento = '';
let enderecoCompleto = { rua: "", bairro: "", cidade: "", cep: "" };
let clienteLogado = null;

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

// --- LÓGICA DE IDENTIFICAÇÃO E CADASTRO ---
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
    } catch (e) {
        console.error("Erro ao verificar cliente:", e);
    }
};

window.mascaraCEP = (input) => {
    let v = input.value.replace(/\D/g, '');
    if (v.length > 8) v = v.substring(0, 8);
    if (v.length > 5) {
        input.value = v.substring(0, 5) + '-' + v.substring(5, 8);
    } else {
        input.value = v;
    }
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
        if (textoEnderecoAuto) {
            textoEnderecoAuto.innerText = `${data.logradouro}, ${data.bairro} - ${data.localidade}/${data.uf}`;
        }

        enderecoCompleto = { rua: data.logradouro || "", bairro: data.bairro || "", cidade: data.localidade || "", cep: cep };

        const userAgent = `CardapioVacy_User_${userId}`;
        const geoResp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&postalcode=${cep}&country=Brazil`, {
            headers: { 'User-Agent': userAgent }
        });
        const geoData = await geoResp.json();

        if (geoData.length > 0) {
            const latCli = parseFloat(geoData[0].lat);
            const lonCli = parseFloat(geoData[0].lon);

            const dist = calcularDistancia(
                parseFloat(configEntrega.coords.lat),
                parseFloat(configEntrega.coords.log || configEntrega.coords.lng),
                latCli,
                lonCli
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
    } catch (error) {
        console.error("Frete erro:", error);
    } finally {
        cepInput.classList.remove('animate-pulse');
        renderizarCarrinho();
    }
};

function recalcularTaxaEntrega() {
    if (modoPedido === 'retirada') {
        taxaEntregaAtual = 0;
    } else if (configEntrega && configEntrega.tipo === 'km') {
        taxaEntregaAtual = parseFloat((distanciaCliente * configEntrega.valorKm).toFixed(2));
    } else if (configEntrega) {
        taxaEntregaAtual = Number(configEntrega.taxaFixa) || 0;
    }
    renderizarCarrinho();
}

window.atualizarModoPedidoJS = (modo) => {
    modoPedido = modo;
    recalcularTaxaEntrega();
};

// --- LOGICA DO CARRINHO ---
window.adicionarAoCarrinho = (nome, preco) => {
    if (!lojaAberta) {
        alert("Loja Fechada no momento!");
        return;
    }
    carrinho.push({ nome, preco: Number(preco) });
    renderizarCarrinho();
    
    // Pequeno feedback visual no botão de sacola
    const btn = document.getElementById('btnCarrinho');
    btn.classList.add('scale-105');
    setTimeout(() => btn.classList.remove('scale-105'), 200);
};

function renderizarCarrinho() {
    const container = document.getElementById('listaItensCarrinho');
    const totalP1 = document.getElementById('totalPasso1');
    const resumoF = document.getElementById('resumoFinal');
    const badgeQtd = document.getElementById('qtdItensCarrinho');
    const badgeTotal = document.getElementById('valorTotalCarrinho');
    const btnSacola = document.getElementById('btnCarrinho');

    if (carrinho.length > 0) {
        btnSacola.classList.remove('hidden');
        if (badgeQtd) badgeQtd.innerText = `${carrinho.length} ${carrinho.length === 1 ? 'Item' : 'Itens'}`;
    } else {
        btnSacola.classList.add('hidden');
    }

    let subtotal = carrinho.reduce((acc, item) => acc + item.preco, 0);
    const totalGeral = subtotal + taxaEntregaAtual;

    if (badgeTotal) badgeTotal.innerText = `R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    if (container) {
        container.innerHTML = "";
        carrinho.forEach((item, index) => {
            container.innerHTML += `
                <div class="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                    <div class="flex flex-col">
                        <span class="text-xs font-bold text-slate-700 uppercase italic">${item.nome}</span>
                        <span class="text-[10px] font-black text-brand mt-0.5">R$ ${item.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <button onclick="window.removerDoCarrinho(${index})" class="text-slate-300 hover:text-red-500 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>`;
        });
    }

    if (resumoF) {
        resumoF.innerHTML = `
            <div class="space-y-3">
                <div class="flex justify-between text-[10px] font-bold uppercase opacity-60">
                    <span>Subtotal</span>
                    <span>R$ ${subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div class="flex justify-between text-[10px] font-bold uppercase opacity-60">
                    <span>Taxa de Entrega</span>
                    <span>${taxaEntregaAtual > 0 ? 'R$ ' + taxaEntregaAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : 'Grátis'}</span>
                </div>
                <div class="flex justify-between items-end border-t border-white/10 pt-4 mt-2">
                    <span class="text-[10px] font-black uppercase italic">Total do Pedido</span>
                    <span class="text-2xl font-black">R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
            </div>`;
    }
}

window.removerDoCarrinho = (index) => {
    carrinho.splice(index, 1);
    renderizarCarrinho();
};

// --- FINALIZAÇÃO E WHATSAPP ---
window.enviarWhatsApp = async () => {
    const radios = document.getElementsByName('pagamento');
    radios.forEach(r => { if (r.checked) formaPagamento = r.value; });

    if (!formaPagamento) { alert("Escolha como quer pagar!"); return; }

    const nomeCliente = document.getElementById('inputNome')?.value;
    const numeroEnd = document.getElementById('inputNumero')?.value;
    const whatsCliente = document.getElementById('inputWhatsApp')?.value.replace(/\D/g, '');

    if (!nomeCliente) { alert("Diga-nos seu nome!"); return; }
    if (modoPedido === 'entrega' && !numeroEnd) { alert("Falta o número/complemento!"); return; }

    const subtotal = carrinho.reduce((a, b) => a + b.preco, 0);
    const totalFinal = subtotal + taxaEntregaAtual;

    let numDestino = whatsappLoja.replace(/\D/g, '');
    if (numDestino.length <= 11) numDestino = '55' + numDestino;

    const dadosPedido = {
        userId,
        cliente: nomeCliente,
        itens: carrinho,
        total: totalFinal,
        taxaEntrega: taxaEntregaAtual,
        status: "Pendente",
        pagamento: formaPagamento,
        tipo: modoPedido,
        endereco: modoPedido === 'entrega' ? `${enderecoCompleto.rua}, ${numeroEnd} - ${enderecoCompleto.bairro}` : 'Retirada na Loja',
        createdAt: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "pedidos"), dadosPedido);
        
        if (whatsCliente) {
            await setDoc(doc(db, "clientes", whatsCliente), {
                nome: nomeCliente,
                cep: enderecoCompleto.cep,
                distanciaSalva: distanciaCliente,
                ultimaCompra: serverTimestamp()
            }, { merge: true });
        }

        let msg = `*NOVO PEDIDO ONLINE* 🥐\n`;
        msg += `*Cliente:* ${nomeCliente}\n`;
        msg += `------------------------------\n`;
        carrinho.forEach(i => msg += `• ${i.nome} - R$ ${i.preco.toFixed(2)}\n`);
        msg += `------------------------------\n`;
        msg += `*Modo:* ${modoPedido === 'entrega' ? '🛵 Entrega' : '🛍️ Retirada'}\n`;
        if (modoPedido === 'entrega') msg += `*Endereço:* ${dadosPedido.endereco}\n`;
        msg += `*Pagamento:* ${formaPagamento}\n`;
        msg += `*TOTAL: R$ ${totalFinal.toFixed(2)}*\n`;

        window.location.assign(`https://wa.me/${numDestino}?text=${encodeURIComponent(msg)}`);
        carrinho = [];
        window.fecharCarrinho();
    } catch (e) {
        console.error(e);
        alert("Erro ao salvar pedido.");
    }
};

// --- INICIALIZAÇÃO ---
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
    try {
        const userSnap = await getDoc(doc(db, "usuarios", userId));
        if (userSnap.exists()) {
            const d = userSnap.data();
            whatsappLoja = d.whatsapp || "";
            configEntrega = d.configEntrega || { coords: { lat: 0, log: 0 }, raioMaximo: 0, valorKm: 0, tipo: 'fixo' };

            document.getElementById('nomeLoja').innerText = d.nomeNegocio || "Cardápio";
            document.getElementById('nomeLojaRodape').innerText = d.nomeNegocio || "";
            
            if (d.corTema) document.documentElement.style.setProperty('--cor-primaria', d.corTema);
            if (d.fotoCapa) document.getElementById('bannerLoja').style.backgroundImage = `url('${d.fotoCapa}')`;
            
            const imgP = document.getElementById('logoLoja');
            if (d.fotoPerfil || d.fotoLogo) {
                imgP.src = d.fotoPerfil || d.fotoLogo;
                imgP.classList.remove('hidden');
            }

            lojaAberta = verificarSeEstaAberto(d.horarioAbertura, d.horarioFechamento);
            const labelS = document.getElementById('labelStatus');
            const dotS = document.getElementById('dotStatus');
            if (lojaAberta) {
                dotS.className = "w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]";
                labelS.innerHTML = `<span class="text-emerald-600">Aberto</span> • Fecha às ${d.horarioFechamento}`;
            } else {
                dotS.className = "w-2.5 h-2.5 rounded-full bg-red-500";
                labelS.innerHTML = `<span class="text-red-500">Loja Fechada</span>`;
            }
        }

        const q = query(collection(db, "produtos"), where("userId", "==", userId));
        const snap = await getDocs(q);
        const prods = {};
        snap.forEach(doc => {
            const p = doc.data();
            if (!prods[p.categoria]) prods[p.categoria] = [];
            prods[p.categoria].push(p);
        });

        const nav = document.getElementById('navCategorias');
        const main = document.getElementById('mainContainer');

        if (main && nav) {
            main.innerHTML = "";
            nav.innerHTML = "";
            Object.keys(prods).forEach(cat => {
                // Nav Pills
                const tab = document.createElement('button');
                tab.className = "category-tab";
                tab.innerText = cat;
                tab.onclick = () => {
                    document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    document.getElementById(cat).scrollIntoView({ behavior: 'smooth', block: 'start' });
                };
                nav.appendChild(tab);

                // Section
                let section = `<section id="${cat}" class="mt-8">
                    <h2 class="px-4 text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4 italic">${cat}</h2>
                    <div class="grid grid-cols-1">`;
                
                prods[cat].forEach(p => {
                    section += `
                        <div class="product-card" onclick="window.adicionarAoCarrinho('${p.nome}', ${p.preco})">
                            <div class="product-info">
                                <h3 class="font-bold text-slate-800 text-sm italic uppercase leading-tight">${p.nome}</h3>
                                <p class="text-slate-400 text-[10px] mt-1 line-clamp-2 leading-relaxed font-medium">${p.descricao || 'Sem descrição.'}</p>
                                <p class="text-emerald-600 font-black text-sm mt-3">R$ ${Number(p.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                            <img src="${p.foto}" class="product-img" loading="lazy">
                        </div>`;
                });
                main.innerHTML += section + `</div></section>`;
            });
            // Ativa a primeira categoria
            if(nav.firstChild) nav.firstChild.classList.add('active');
        }
        document.getElementById('loading-overlay').classList.add('loader-hidden');
    } catch (e) {
        console.error(e);
    }
}

inicializar();
