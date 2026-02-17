import { db } from './firebase-config.js'; 
import { collection, query, where, getDocs, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
let clienteLogado = null; // Armazena dados do cliente recuperados

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

    const status = document.getElementById('statusCliente');
    if(status) status.innerText = "Buscando seu cadastro...";

    try {
        const docRef = doc(db, "clientes", whatsapp);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const d = docSnap.data();
            clienteLogado = d;

            // Preenche os campos automaticamente no HTML
            if(document.getElementById('inputNome')) document.getElementById('inputNome').value = d.nome || "";
            if(document.getElementById('inputCEP')) document.getElementById('inputCEP').value = d.cep || "";
            if(document.getElementById('inputNumero')) document.getElementById('inputNumero').value = d.numero || "";
            
            if(status) status.innerHTML = `<span class="text-green-600 font-bold">Olá, ${d.nome}! Seus dados foram carregados.</span>`;

            // Se tem CEP e distância salva, já calcula o frete sem usar API externa
            if (d.cep && d.distanciaSalva) {
                distanciaCliente = d.distanciaSalva;
                recalcularTaxaEntrega();
            }
        } else {
            if(status) status.innerText = "Não encontramos cadastro. Preencha abaixo para a primeira compra!";
        }
    } catch (e) { console.error("Erro ao verificar cliente:", e); }
};

// --- LÓGICA DE MÁSCARA E BUSCA DE CEP ---

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

    // ECONOMIA DE API: Se for o mesmo CEP do cliente logado, pula a busca no mapa
    if (clienteLogado && clienteLogado.cep === cep && clienteLogado.distanciaSalva) {
        distanciaCliente = clienteLogado.distanciaSalva;
        recalcularTaxaEntrega();
        if(camposEndereco) camposEndereco.classList.remove('hidden');
        return;
    }

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

        // BUSCA NO MAPA (LOCATION IQ ou NOMINATIM)
        const userAgent = `CardapioVacy_User_${userId}`;
        const geoResp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&postalcode=${cep}&country=Brazil&v=${Date.now()}`, {
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
                alert(`Não entregamos nesta distância (${dist.toFixed(1)}km). Limite: ${configEntrega.raioMaximo}km.`);
                if(btnProx2) btnProx2.disabled = true;
            } else {
                distanciaCliente = dist;
                recalcularTaxaEntrega();
                if(btnProx2) {
                    btnProx2.disabled = false;
                    btnProx2.classList.replace('bg-slate-200', 'bg-brand');
                }
            }
        }
    } catch (error) {
        console.error("Erro no cálculo de frete:", error);
        taxaEntregaAtual = Number(configEntrega.taxaFixa) || 0;
    } finally {
        cepInput.classList.remove('animate-pulse');
        renderizarCarrinho();
    }
};

function recalcularTaxaEntrega() {
    if (modoPedido === 'retirada') {
        taxaEntregaAtual = 0;
    } else if (configEntrega.tipo === 'km') {
        taxaEntregaAtual = parseFloat((distanciaCliente * configEntrega.valorKm).toFixed(2));
    } else {
        taxaEntregaAtual = Number(configEntrega.taxaFixa) || 0;
    }
    renderizarCarrinho();
}

// --- LOGICA DE NAVEGAÇÃO E MODOS ---

window.atualizarModoPedidoJS = (modo) => {
    modoPedido = modo;
    const btnProx1 = document.getElementById('btnProximo1');
    recalcularTaxaEntrega();
    if(btnProx1) {
        btnProx1.disabled = false;
        btnProx1.classList.replace('bg-slate-200', 'bg-brand');
    }
};

// --- RENDERIZAÇÃO ---

window.adicionarAoCarrinho = (nome, preco) => {
    if(!verificarSeEstaAberto(configHorario.abertura, configHorario.fechamento)) {
        alert("Loja Fechada!"); return;
    }
    carrinho.push({ nome, preco: Number(preco) });
    atualizarBadgeCarrinho();
};

function atualizarBadgeCarrinho() {
    const btn = document.getElementById('btnCarrinho');
    const badge = document.getElementById('qtdItensCarrinho');
    if (carrinho.length > 0) {
        btn.classList.remove('hidden');
        if(badge) badge.innerText = carrinho.length;
    }
}

function renderizarCarrinho() {
    const container = document.getElementById('listaItensCarrinho');
    const totalP1 = document.getElementById('totalPasso1');
    const resumoF = document.getElementById('resumoFinal');
    
    if(!container) return;
    container.innerHTML = "";
    let subtotal = 0;

    carrinho.forEach(item => {
        subtotal += item.preco;
        container.innerHTML += `
            <div class="flex justify-between items-center p-3 bg-slate-50 rounded-2xl mb-1">
                <span class="text-[11px] font-bold text-slate-700">${item.nome}</span>
                <span class="text-[11px] font-black text-brand">R$ ${item.preco.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>`;
    });

    const totalGeral = subtotal + taxaEntregaAtual;

    if(totalP1) {
        totalP1.innerHTML = `
            <div class="flex justify-between items-center p-4 bg-slate-900 rounded-2xl text-white">
                <span class="text-[9px] font-bold uppercase opacity-60 italic">Total</span>
                <span class="font-black text-lg">R$ ${totalGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>`;
    }

    if(resumoF) {
        resumoF.innerHTML = `
            <div class="space-y-2 text-[11px]">
                <div class="flex justify-between opacity-70"><span>Subtotal:</span><span>R$ ${subtotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span></div>
                <div class="flex justify-between opacity-70">
                    <span>Frete ${distanciaCliente > 0 ? '('+distanciaCliente.toFixed(1)+'km)' : ''}:</span>
                    <span>${taxaEntregaAtual > 0 ? 'R$ ' + taxaEntregaAtual.toLocaleString('pt-BR', {minimumFractionDigits: 2}) : 'Grátis'}</span>
                </div>
                <div class="flex justify-between text-base font-black border-t border-white/20 pt-2 mt-2">
                    <span>TOTAL:</span><span>R$ ${totalGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                </div>
            </div>`;
    }
}

// --- FINALIZAÇÃO E PERSISTÊNCIA ---

async function salvarDadosCliente() {
    const whatsapp = document.getElementById('inputWhatsApp').value.replace(/\D/g, '');
    const nome = document.getElementById('inputNome').value;
    const numero = document.getElementById('inputNumero').value;

    if (!whatsapp || !nome) return;

    const info = {
        nome,
        whatsapp,
        cep: enderecoCompleto.cep,
        rua: enderecoCompleto.rua,
        bairro: enderecoCompleto.bairro,
        cidade: enderecoCompleto.cidade,
        numero,
        distanciaSalva: distanciaCliente, // SALVA PARA NÃO CALCULAR NOVO FRETE NA PRÓXIMA
        ultimaCompra: new Date()
    };

    try {
        await setDoc(doc(db, "clientes", whatsapp), info, { merge: true });
    } catch (e) { console.error("Erro ao salvar dados do cliente:", e); }
}

window.enviarWhatsApp = async () => {
    const radios = document.getElementsByName('pagamento');
    radios.forEach(r => { if(r.checked) formaPagamento = r.value; });

    if(!formaPagamento) { alert("Selecione o pagamento!"); return; }

    let numero = document.getElementById('inputNumero').value;
    if(modoPedido === 'entrega' && !numero) { alert("Preencha o número/complemento."); return; }

    // Salva o cadastro do cliente antes de sair
    await salvarDadosCliente();

    const subtotal = carrinho.reduce((a,b) => a + b.preco, 0);
    const totalFinal = subtotal + taxaEntregaAtual;

    let texto = `*NOVO PEDIDO - ${document.getElementById('nomeLoja').innerText}* 🛒\n`;
    texto += `--------------------------------\n`;
    carrinho.forEach(i => texto += `• ${i.nome} (R$ ${i.preco.toLocaleString('pt-BR', {minimumFractionDigits: 2})})\n`);
    texto += `--------------------------------\n`;
    texto += `*MODO:* ${modoPedido === 'entrega' ? '🛵 Entrega' : '🛍️ Retirada'}\n`;
    
    if(modoPedido === 'entrega') {
        texto += `*ENDEREÇO:* ${enderecoCompleto.rua}, ${numero}\n`;
        texto += `*BAIRRO:* ${enderecoCompleto.bairro}\n`;
        texto += `*FRETE:* R$ ${taxaEntregaAtual.toLocaleString('pt-BR', {minimumFractionDigits: 2})} (${distanciaCliente.toFixed(1)}km)\n`;
    }

    texto += `*PAGAMENTO:* ${formaPagamento}\n`;
    texto += `*TOTAL: R$ ${totalFinal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}*\n`;
    
    window.open(`https://wa.me/${whatsappLoja.replace(/\D/g,'')}?text=${encodeURIComponent(texto)}`);
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
            configHorario = { abertura: d.horarioAbertura || "", fechamento: d.horarioFechamento || "" };
            configEntrega = d.configEntrega || { coords: {lat:0, log:0}, raioMaximo: 0, valorKm: 0, tipo: 'fixo' };

            document.getElementById('nomeLoja').innerText = d.nomeNegocio || "Minha Loja";
            if(d.corTema) document.documentElement.style.setProperty('--cor-primaria', d.corTema);
            // ... resto do código visual (banner, logo) ...
        }

        const q = query(collection(db, "produtos"), where("userId", "==", userId));
        const snap = await getDocs(q);
        // ... lógica de renderizar produtos igual ao seu código ...
        
        document.getElementById('loading-overlay').classList.add('loader-hidden');
    } catch (e) { console.error(e); }
}

inicializar();
