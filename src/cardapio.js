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
let configEntrega = null; 

// --- ESTADO GLOBAL DO PEDIDO ---
let carrinho = []; // Agora armazenará objetos {nome, preco, qtd}
let taxaEntregaAtual = 0;
let distanciaCliente = 0; 
let modoPedido = 'entrega'; 
let formaPagamento = '';
let enderecoCompleto = { rua: "", bairro: "", cidade: "", cep: "" };
let clienteLogado = null;

// --- UTILITÁRIOS: FORMATAÇÃO ---
const formatarMoeda = (valor) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// --- CÁLCULO DE DISTÂNCIA (HAVERSINE) ---
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

// --- LÓGICA DE IDENTIFICAÇÃO ---
window.verificarCliente = async (valor) => {
    const whatsapp = valor.replace(/\D/g, '');
    if (whatsapp.length < 10) return;

    const statusElement = document.getElementById('statusCliente');
    if(statusElement) statusElement.innerText = "Buscando cadastro...";

    try {
        const docRef = doc(db, "clientes", whatsapp);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const d = docSnap.data();
            clienteLogado = { ...d, whatsapp: whatsapp };
            
            if(document.getElementById('inputNome')) document.getElementById('inputNome').value = d.nome || "";
            if(document.getElementById('inputCEP')) document.getElementById('inputCEP').value = d.cep || "";
            if(document.getElementById('inputNumero')) document.getElementById('inputNumero').value = d.numero || "";
            
            if(statusElement) statusElement.innerText = "Bem-vindo(a) de volta!";

            if (d.cep && d.distanciaSalva) {
                distanciaCliente = d.distanciaSalva;
                recalcularTaxaEntrega();
            }
        } else {
            if(statusElement) statusElement.innerText = "Primeira vez por aqui? Seja bem-vindo!";
        }
    } catch (e) { console.error("Erro ao verificar cliente:", e); }
};

// --- ENDEREÇO E CEP ---
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

    if (status) status.innerText = "Calculando frete...";
    cepInput.classList.add('animate-pulse');
    
    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();

        if (data.erro) {
            if(status) status.innerText = "CEP não encontrado!";
            return;
        }

        if(camposEndereco) camposEndereco.classList.remove('hidden');
        if(textoEnderecoAuto) {
            textoEnderecoAuto.innerText = `${data.logradouro}, ${data.bairro} - ${data.localidade}/${data.uf}`;
        }

        enderecoCompleto = { rua: data.logradouro || "", bairro: data.bairro || "", cidade: data.localidade || "", cep: cep };

        // Integração com OpenStreetMap para Distância Real
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
                if(status) status.innerHTML = `<span class="text-red-500">Fora da área de entrega (${dist.toFixed(1)}km)</span>`;
                if(btnProx2) btnProx2.disabled = true;
            } else {
                distanciaCliente = dist;
                recalcularTaxaEntrega();
                if(status) status.innerHTML = `<span class="text-green-500">Frete calculado com sucesso!</span>`;
                if(btnProx2) {
                    btnProx2.disabled = false;
                    btnProx2.classList.replace('bg-slate-200', 'bg-brand');
                }
            }
        }
    } catch (error) {
        console.error("Erro no cálculo de frete:", error);
    } finally {
        cepInput.classList.remove('animate-pulse');
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

// --- GESTÃO DO CARRINHO ---
window.adicionarAoCarrinho = (nome, preco) => {
    if(!lojaAberta) {
        alert("Loja Fechada no momento!"); return;
    }
    
    const itemExistente = carrinho.find(item => item.nome === nome);
    if (itemExistente) {
        itemExistente.qtd += 1;
    } else {
        carrinho.push({ nome, preco: Number(preco), qtd: 1 });
    }
    
    atualizarBadgeCarrinho();
    
    // Feedback tátil simples (animação de pulso no botão)
    const btn = document.getElementById('btnCarrinho');
    btn.classList.add('scale-105');
    setTimeout(() => btn.classList.remove('scale-105'), 200);
};

function atualizarBadgeCarrinho() {
    const btn = document.getElementById('btnCarrinho');
    const badge = document.getElementById('qtdItensCarrinho');
    const valorBadge = document.getElementById('valorTotalCarrinho');
    
    if (carrinho.length > 0) {
        btn.classList.remove('hidden');
        const totalItens = carrinho.reduce((acc, item) => acc + item.qtd, 0);
        const subtotal = carrinho.reduce((acc, item) => acc + (item.preco * item.qtd), 0);
        
        if(badge) badge.innerText = totalItens;
        if(valorBadge) valorBadge.innerText = formatarMoeda(subtotal);
    } else {
        btn.classList.add('hidden');
    }
}

function renderizarCarrinho() {
    const container = document.getElementById('listaItensCarrinho');
    const totalP1 = document.getElementById('totalPasso1');
    const resumoF = document.getElementById('resumoFinal');
    
    if(!container) return;
    container.innerHTML = "";
    let subtotal = 0;

    carrinho.forEach((item, index) => {
        const totalItem = item.preco * item.qtd;
        subtotal += totalItem;
        container.innerHTML += `
            <div class="flex justify-between items-center p-4 bg-white rounded-3xl border border-slate-100 shadow-sm animate-fade-in">
                <div class="flex flex-col">
                    <span class="text-xs font-black text-slate-800 uppercase tracking-tighter">${item.qtd}x ${item.nome}</span>
                    <span class="text-[10px] font-bold text-slate-400">${formatarMoeda(item.preco)} cada</span>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-xs font-black text-brand">${formatarMoeda(totalItem)}</span>
                    <button onclick="window.removerItem(${index})" class="text-slate-300 hover:text-red-500 transition-colors">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>`;
    });

    const totalGeral = subtotal + taxaEntregaAtual;

    if(totalP1) {
        totalP1.innerHTML = `
            <div class="flex justify-between items-center p-5 bg-slate-900 rounded-[2rem] text-white shadow-xl">
                <span class="text-[10px] font-black uppercase opacity-60 tracking-widest">Total com Frete</span>
                <span class="font-black text-xl tracking-tighter">${formatarMoeda(totalGeral)}</span>
            </div>`;
    }

    if(resumoF) {
        resumoF.innerHTML = `
            <div class="space-y-3 text-xs">
                <div class="flex justify-between opacity-60 font-bold"><span>Itens:</span><span>${formatarMoeda(subtotal)}</span></div>
                <div class="flex justify-between opacity-60 font-bold">
                    <span>Taxa de Entrega:</span>
                    <span>${taxaEntregaAtual > 0 ? formatarMoeda(taxaEntregaAtual) : 'Grátis'}</span>
                </div>
                <div class="flex justify-between text-lg font-black border-t border-white/10 pt-4 mt-2 tracking-tighter">
                    <span>TOTAL:</span><span>${formatarMoeda(totalGeral)}</span>
                </div>
            </div>`;
    }
    
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

window.removerItem = (index) => {
    if (carrinho[index].qtd > 1) {
        carrinho[index].qtd -= 1;
    } else {
        carrinho.splice(index, 1);
    }
    atualizarBadgeCarrinho();
    renderizarCarrinho();
    if (carrinho.length === 0) window.fecharCarrinho();
};

// --- FINALIZAÇÃO E ENVIO ---
window.enviarWhatsApp = async () => {
    const radios = document.getElementsByName('pagamento');
    radios.forEach(r => { if(r.checked) formaPagamento = r.value; });

    if(!formaPagamento) { alert("Ops! Escolha como deseja pagar."); return; }

    const nomeCliente = document.getElementById('inputNome')?.value || "Cliente Online";
    const numeroEnd = document.getElementById('inputNumero')?.value || "";
    const whatsCliente = document.getElementById('inputWhatsApp')?.value.replace(/\D/g,'');

    if(modoPedido === 'entrega' && !numeroEnd) { alert("Precisamos do número ou complemento do endereço."); return; }
    if(!whatsCliente || whatsCliente.length < 10) { alert("Informe um WhatsApp válido."); return; }

    const subtotal = carrinho.reduce((acc, item) => acc + (item.preco * item.qtd), 0);
    const totalFinal = subtotal + taxaEntregaAtual;

    let numDestino = whatsappLoja.replace(/\D/g,'');
    if (numDestino.length <= 11) numDestino = '55' + numDestino;

    const dadosPedido = {
        userId: userId,
        cliente: nomeCliente,
        whatsappCliente: whatsCliente,
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

        // Salva/Atualiza cadastro do cliente
        await setDoc(doc(db, "clientes", whatsCliente), {
            nome: nomeCliente,
            cep: enderecoCompleto.cep || "",
            distanciaSalva: distanciaCliente,
            numero: numeroEnd,
            ultimaCompra: serverTimestamp()
        }, { merge: true });

        // Montagem da mensagem WhatsApp
        let msg = `*🥐 NOVO PEDIDO - ${nomeCliente}*\n\n`;
        carrinho.forEach(i => msg += `• *${i.qtd}x* ${i.nome} (${formatarMoeda(i.preco)})\n`);
        msg += `\n------------------------------\n`;
        msg += `*Subtotal:* ${formatarMoeda(subtotal)}\n`;
        msg += `*Frete:* ${taxaEntregaAtual > 0 ? formatarMoeda(taxaEntregaAtual) : 'Grátis'}\n`;
        msg += `*TOTAL: ${formatarMoeda(totalFinal)}*\n`;
        msg += `------------------------------\n\n`;
        msg += `*Modo:* ${modoPedido === 'entrega' ? '🛵 Entrega' : '🛍️ Retirada'}\n`;
        if(modoPedido === 'entrega') msg += `*Endereço:* ${dadosPedido.endereco}\n`;
        msg += `*Pagamento:* ${formaPagamento}\n`;

        window.location.assign(`https://wa.me/${numDestino}?text=${encodeURIComponent(msg)}`);
        
        // Reset
        carrinho = [];
        atualizarBadgeCarrinho();
        window.fecharCarrinho();

    } catch (e) {
        console.error("Erro ao processar pedido:", e);
        alert("Erro ao salvar pedido no banco de dados.");
    }
};

// --- INICIALIZAÇÃO ---
function verificarSeEstaAberto(abertura, fechamento) {
    if (!abertura || !fechamento) return true;
    const agora = new Date();
    const horaAtual = agora.getHours() * 60 + agora.getMinutes();
    const [hAbre, mAbre] = abertura.split(':').map(Number);
    const [hFecha, mFecha] = fechamento.split(':').map(Number);
    let minAbre = hAbre * 60 + mAbre;
    let minFecha = hFecha * 60 + mFecha;
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
            configEntrega = d.configEntrega || { coords: {lat:0, lng:0}, raioMaximo: 0, valorKm: 0, tipo: 'fixo' };

            document.getElementById('nomeLoja').innerText = d.nomeNegocio || "Loja";
            if(d.corTema) document.documentElement.style.setProperty('--cor-primaria', d.corTema);
            
            const banner = document.getElementById('bannerLoja');
            if(banner && d.fotoCapa) banner.style.backgroundImage = `url('${d.fotoCapa}')`;

            const imgPerfil = document.getElementById('logoLoja');
            if (imgPerfil && (d.fotoPerfil || d.fotoLogo)) {
                imgPerfil.src = d.fotoPerfil || d.fotoLogo;
                imgPerfil.classList.remove('hidden');
                document.getElementById('emojiLoja')?.classList.add('hidden');
            }

            lojaAberta = verificarSeEstaAberto(d.horarioAbertura, d.horarioFechamento);
            const labelStatus = document.getElementById('labelStatus');
            const dotStatus = document.getElementById('dotStatus');
            
            if (lojaAberta) {
                dotStatus.className = "w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]";
                labelStatus.innerHTML = `<span class="text-green-600 font-black">Aberto agora</span>`;
            } else {
                dotStatus.className = "w-2.5 h-2.5 rounded-full bg-red-500";
                labelStatus.innerHTML = `<span class="text-red-600 font-black">Fechado</span>`;
            }
        }

        // Renderização dos Produtos
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
        
        if(main && nav) {
            main.innerHTML = ""; nav.innerHTML = "";
            Object.keys(prods).forEach((cat) => {
                const catId = cat.replace(/\s/g, '');
                nav.innerHTML += `<a href="#${catId}" class="category-tab transition-all whitespace-nowrap">${cat}</a>`;
                
                let section = `
                <section id="${catId}" class="animate-fade-in">
                    <h2 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-2">${cat}</h2>
                    <div class="grid grid-cols-1 gap-4">`;
                
                prods[cat].forEach(p => {
                    section += `
                        <div class="product-card glass-card p-4 rounded-[2rem] flex items-center justify-between shadow-sm border border-white">
                            <div class="flex-1 pr-4">
                                <h3 class="text-sm font-black text-slate-800 tracking-tight">${p.nome}</h3>
                                <p class="text-[10px] text-slate-400 font-medium mt-1 leading-relaxed line-clamp-2">${p.descricao || ''}</p>
                                <p class="text-brand font-black text-sm mt-3">${formatarMoeda(Number(p.preco))}</p>
                            </div>
                            <div class="relative w-24 h-24 shrink-0">
                                <img src="${p.foto}" class="w-full h-full object-cover rounded-[1.5rem] shadow-md">
                                <button onclick="adicionarAoCarrinho('${p.nome}', ${p.preco})" 
                                        class="absolute -bottom-2 -right-2 w-10 h-10 bg-brand text-white rounded-2xl shadow-lg flex items-center justify-center hover:scale-110 active:scale-90 transition-all">
                                    <i data-lucide="plus" class="w-5 h-5"></i>
                                </button>
                            </div>
                        </div>`;
                });
                main.innerHTML += section + `</div></section>`;
            });
        }
        
        document.getElementById('loading-overlay').classList.add('loader-hidden');
        if(typeof lucide !== 'undefined') lucide.createIcons();

    } catch (e) { console.error(e); }
}

inicializar();
