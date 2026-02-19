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

    if (clienteLogado && clienteLogado.cep === cep && clienteLogado.distanciaSalva) {
        distanciaCliente = clienteLogado.distanciaSalva;
        recalcularTaxaEntrega();
        if (camposEndereco) camposEndereco.classList.remove('hidden');
        return;
    }

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
        console.error("Erro no cálculo de frete:", error);
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
    const btnProx1 = document.getElementById('btnProximo1');
    recalcularTaxaEntrega();
    if (btnProx1) {
        btnProx1.disabled = false;
        btnProx1.classList.replace('bg-slate-200', 'bg-brand');
    }
};

// --- RENDERIZAÇÃO ---
window.adicionarAoCarrinho = (nome, preco) => {
    if (!lojaAberta) {
        alert("Loja Fechada no momento!");
        return;
    }
    carrinho.push({ nome, preco: Number(preco) });
    atualizarBadgeCarrinho();
};

function atualizarBadgeCarrinho() {
    const btn = document.getElementById('btnCarrinho');
    const badge = document.getElementById('qtdItensCarrinho');
    if (carrinho.length > 0) {
        btn.classList.remove('hidden');
        if (badge) badge.innerText = parseInt(carrinho.length);
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
                <span class="text-[11px] font-black text-brand">R$ ${item.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>`;
    });

    const totalGeral = subtotal + taxaEntregaAtual;

    if (totalP1) {
        totalP1.innerHTML = `
            <div class="flex justify-between items-center p-4 bg-slate-900 rounded-2xl text-white">
                <span class="text-[9px] font-bold uppercase opacity-60 italic">Total</span>
                <span class="font-black text-lg">R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>`;
    }

    if (resumoF) {
        resumoF.innerHTML = `
            <div class="space-y-2 text-[11px]">
                <div class="flex justify-between opacity-70"><span>Subtotal:</span><span>R$ ${subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                <div class="flex justify-between opacity-70">
                    <span>Frete:</span>
                    <span>${taxaEntregaAtual > 0 ? 'R$ ' + taxaEntregaAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : 'Grátis'}</span>
                </div>
                <div class="flex justify-between text-base font-black border-t border-white/20 pt-2 mt-2">
                    <span>TOTAL:</span><span>R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
            </div>`;
    }
}

window.abrirCarrinho = () => {
    document.getElementById('modalCarrinho')?.classList.remove('hidden');
    if (window.irParaPasso) window.irParaPasso(1);
    renderizarCarrinho();
};

window.fecharCarrinho = () => {
    document.getElementById('modalCarrinho')?.classList.add('hidden');
};

// --- FINALIZAÇÃO, FIREBASE E WHATSAPP ---
window.enviarWhatsApp = async () => {
    const radios = document.getElementsByName('pagamento');
    radios.forEach(r => { if (r.checked) formaPagamento = r.value; });

    if (!formaPagamento) { alert("Selecione a forma de pagamento!"); return; }

    const nomeCliente = document.getElementById('inputNome')?.value || "Cliente Online";
    const numeroEnd = document.getElementById('inputNumero')?.value || "";

    if (modoPedido === 'entrega' && !numeroEnd) { alert("Informe o número do endereço."); return; }

    const subtotal = carrinho.reduce((a, b) => a + b.preco, 0);
    const totalFinal = subtotal + taxaEntregaAtual;

    let numDestino = whatsappLoja.replace(/\D/g, '');
    if (numDestino.length >= 10 && numDestino.length <= 11) {
        numDestino = '55' + numDestino;
    }

    const dadosPedido = {
        userId: userId,
        cliente: nomeCliente,
        itens: carrinho,
        total: totalFinal,
        taxaEntrega: taxaEntregaAtual,
        status: "Pendente",
        origem: "Online",
        pagamento: formaPagamento,
        tipo: modoPedido,
        endereco: modoPedido === 'entrega' ? `${enderecoCompleto.rua}, ${numeroEnd} - ${enderecoCompleto.bairro}` : 'Retirada na Loja',
        createdAt: serverTimestamp(),
        horaEntrega: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };

    try {
        await addDoc(collection(db, "pedidos"), dadosPedido);

        const whatsCliente = document.getElementById('inputWhatsApp')?.value.replace(/\D/g, '');
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
        msg += `*TOTAL: R$ ${totalFinal.toFixed(2)}*\n\n`;
        msg += `_Pedido registrado no sistema._`;

        const linkWhats = `https://wa.me/${numDestino}?text=${encodeURIComponent(msg)}`;
        window.location.assign(linkWhats);

        carrinho = [];
        fecharCarrinho();
        atualizarBadgeCarrinho();

    } catch (e) {
        console.error("Erro ao processar pedido:", e);
        alert("Houve um erro ao salvar seu pedido.");
    }
};

// --- FIREBASE E INICIALIZAÇÃO ---
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
            configHorario = { abertura: d.horarioAbertura || "", fechamento: d.horarioFechamento || "" };
            configEntrega = d.configEntrega || { coords: { lat: 0, log: 0 }, raioMaximo: 0, valorKm: 0, tipo: 'fixo' };

            document.getElementById('nomeLoja').innerText = d.nomeNegocio || "Loja";
            document.getElementById('nomeLojaRodape').innerText = d.nomeNegocio || "";

            const imgPerfil = document.getElementById('logoLoja');
            const emojiPerfil = document.getElementById('emojiLoja');
            const urlFoto = d.fotoPerfil || d.fotoLogo;

            if (urlFoto && imgPerfil) {
                imgPerfil.src = urlFoto;
                imgPerfil.classList.remove('hidden');
                if (emojiPerfil) emojiPerfil.classList.add('hidden');
            }

            if (d.corTema) document.documentElement.style.setProperty('--cor-primaria', d.corTema);

            const banner = document.getElementById('bannerLoja');
            if (banner && d.fotoCapa) banner.style.backgroundImage = `url('${d.fotoCapa}')`;

            // --- LÓGICA DE STATUS COM HORÁRIO DINÂMICO ---
            lojaAberta = verificarSeEstaAberto(d.horarioAbertura, d.horarioFechamento);
            const labelStatus = document.getElementById('labelStatus');
            const dotStatus = document.getElementById('dotStatus');

            if (lojaAberta) {
                if (dotStatus) dotStatus.className = "w-2 h-2 rounded-full bg-green-500 ping-aberto";
                if (labelStatus) {
                    labelStatus.innerHTML = `<span class="text-green-600 font-bold">Aberto</span> até ${d.horarioFechamento || '--:--'}`;
                }
            } else {
                if (dotStatus) dotStatus.className = "w-2 h-2 rounded-full bg-red-500";
                if (labelStatus) {
                    labelStatus.innerHTML = `<span class="text-red-600 font-bold">Fechado</span> • Abre às ${d.horarioAbertura || '--:--'}`;
                }
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
            Object.keys(prods).forEach((cat) => {
                nav.innerHTML += `<a href="#${cat.replace(/\s/g, '')}" class="category-tab pb-2 whitespace-nowrap font-bold text-xs uppercase">${cat}</a>`;
                let section = `<section id="${cat.replace(/\s/g, '')}" class="pt-4"><h2 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">${cat}</h2><div class="space-y-3">`;
                prods[cat].forEach(p => {
                    section += `
                        <div class="bg-white p-3 rounded-3xl flex items-center justify-between shadow-sm border border-slate-50">
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
                main.innerHTML += section + `</div></section>`;
            });
        }
        document.getElementById('loading-overlay').classList.add('loader-hidden');
    } catch (e) {
        console.error(e);
    }
}

inicializar();
