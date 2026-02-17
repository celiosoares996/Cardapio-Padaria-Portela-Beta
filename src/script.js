import { db } from './firebase-config.js'; 
import { 
    collection, query, where, getDocs, doc, getDoc, setDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const userId = params.get('id');

// --- ESTADO GLOBAL ---
let whatsappLoja = ""; 
let configEntrega = { coords: {lat:0, log:0}, raioMaximo: 0, valorKm: 0, tipo: 'fixo', taxaFixa: 0 };
let carrinho = [];
let taxaEntregaAtual = 0;
let distanciaCliente = 0; 
let modoPedido = 'entrega'; 
let enderecoCompleto = { rua: "", bairro: "", cidade: "", cep: "" };
let clienteLogado = null;

// --- CÁLCULO DE DISTÂNCIA ---
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

// --- BUSCAR CLIENTE PELO WHATSAPP ---
window.verificarCliente = async (valor) => {
    const whatsapp = valor.replace(/\D/g, '');
    if (whatsapp.length < 10) return;

    const status = document.getElementById('statusCliente');
    if(status) status.innerText = "Buscando cadastro...";

    try {
        const docSnap = await getDoc(doc(db, "clientes", whatsapp));
        if (docSnap.exists()) {
            const d = docSnap.data();
            clienteLogado = d;
            document.getElementById('inputNome').value = d.nome || "";
            document.getElementById('inputCEP').value = d.cep || "";
            document.getElementById('inputNumero').value = d.numero || "";
            if(status) status.innerHTML = `<span class="text-green-600 font-bold">Olá ${d.nome}! Dados carregados.</span>`;
            
            if (d.cep && d.distanciaSalva) {
                distanciaCliente = d.distanciaSalva;
                recalcularTaxa();
            }
        } else {
            if(status) status.innerText = "Primeira compra? Preencha os dados abaixo:";
        }
    } catch (e) { console.error(e); }
};

// --- LÓGICA DE CEP E MAPA ---
window.mascaraCEP = (i) => {
    let v = i.value.replace(/\D/g, '');
    if (v.length > 5) v = v.substring(0,5) + '-' + v.substring(5,8);
    i.value = v;
    if (v.replace('-', '').length === 8) window.buscarCEP();
};

window.buscarCEP = async () => {
    const cep = document.getElementById('inputCEP').value.replace(/\D/g, '');
    if (cep.length !== 8) return;

    // Economia de API se for o mesmo CEP salvo
    if (clienteLogado && clienteLogado.cep === cep && clienteLogado.distanciaSalva) {
        distanciaCliente = clienteLogado.distanciaSalva;
        recalcularTaxa();
        document.getElementById('camposEndereco').classList.remove('hidden');
        return;
    }

    try {
        const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await resp.json();
        if (data.erro) return;

        enderecoCompleto = { rua: data.logradouro, bairro: data.bairro, cidade: data.localidade, cep: cep };
        document.getElementById('textoEnderecoAuto').innerText = `${data.logradouro}, ${data.bairro}`;
        document.getElementById('camposEndereco').classList.remove('hidden');

        // Busca coordenadas
        const geo = await fetch(`https://nominatim.openstreetmap.org/search?format=json&postalcode=${cep}&country=Brazil`);
        const gData = await geo.json();

        if (gData.length > 0) {
            distanciaCliente = calcularDistancia(
                parseFloat(configEntrega.coords.lat), 
                parseFloat(configEntrega.coords.log || configEntrega.coords.lng),
                parseFloat(gData[0].lat), 
                parseFloat(gData[0].lon)
            );
            recalcularTaxa();
        }
    } catch (e) { console.error(e); }
};

function recalcularTaxa() {
    if (modoPedido === 'retirada') {
        taxaEntregaAtual = 0;
    } else {
        taxaEntregaAtual = configEntrega.tipo === 'km' ? 
            parseFloat((distanciaCliente * configEntrega.valorKm).toFixed(2)) : 
            Number(configEntrega.taxaFixa);
    }
    const btn = document.getElementById('btnProximo2');
    if(btn) { btn.disabled = false; btn.classList.replace('bg-slate-200', 'bg-brand'); }
    renderizarCarrinho();
}

// --- FUNÇÕES DE INTERFACE (Abertura/Carrinho) ---
window.atualizarModoPedidoJS = (modo) => { modoPedido = modo; recalcularTaxa(); };

window.adicionarAoCarrinho = (nome, preco) => {
    carrinho.push({ nome, preco: Number(preco) });
    const btn = document.getElementById('btnCarrinho');
    btn.classList.remove('hidden');
    document.getElementById('qtdItensCarrinho').innerText = carrinho.length;
};

window.abrirCarrinho = () => {
    document.getElementById('modalCarrinho').classList.remove('hidden');
    renderizarCarrinho();
};

window.fecharCarrinho = () => document.getElementById('modalCarrinho').classList.add('hidden');

function renderizarCarrinho() {
    const lista = document.getElementById('listaItensCarrinho');
    lista.innerHTML = "";
    let subtotal = 0;
    carrinho.forEach(item => {
        subtotal += item.preco;
        lista.innerHTML += `<div class="flex justify-between p-2 bg-slate-50 rounded-lg mb-1 text-xs"><span>${item.nome}</span><b>R$ ${item.preco.toFixed(2)}</b></div>`;
    });

    const total = subtotal + taxaEntregaAtual;
    document.getElementById('totalPasso1').innerHTML = `<div class="p-4 bg-slate-900 text-white rounded-xl flex justify-between"><span>Total</span><b>R$ ${total.toFixed(2)}</b></div>`;
    document.getElementById('resumoFinal').innerHTML = `<div class="text-xs space-y-1"><div>Subtotal: R$ ${subtotal.toFixed(2)}</div><div>Frete: R$ ${taxaEntregaAtual.toFixed(2)}</div><div class="text-lg font-bold border-t pt-2">Total: R$ ${total.toFixed(2)}</div></div>`;
}

// --- FINALIZAÇÃO ---
window.enviarWhatsApp = async () => {
    const nome = document.getElementById('inputNome').value;
    const whatsapp = document.getElementById('inputWhatsApp').value.replace(/\D/g, '');
    const numero = document.getElementById('inputNumero').value;
    const pagamento = document.querySelector('input[name="pagamento"]:checked')?.value;

    if(!nome || !whatsapp || !pagamento) return alert("Preencha tudo!");

    // SALVAR CLIENTE
    await setDoc(doc(db, "clientes", whatsapp), {
        nome, whatsapp, cep: enderecoCompleto.cep, 
        rua: enderecoCompleto.rua, bairro: enderecoCompleto.bairro,
        numero, distanciaSalva: distanciaCliente
    }, { merge: true });

    let msg = `*PEDIDO:* \n` + carrinho.map(i => `- ${i.nome}`).join('\n');
    msg += `\n\n*Total:* R$ ${(carrinho.reduce((a,b)=>a+b.preco,0)+taxaEntregaAtual).toFixed(2)}`;
    msg += `\n*Endereço:* ${enderecoCompleto.rua}, ${numero}`;
    
    window.open(`https://wa.me/${whatsappLoja}?text=${encodeURIComponent(msg)}`);
};

// --- INICIALIZAÇÃO DA LOJA ---
async function inicializar() {
    if (!userId) return;
    try {
        const snap = await getDoc(doc(db, "usuarios", userId));
        if (snap.exists()) {
            const d = snap.data();
            whatsappLoja = d.whatsapp.replace(/\D/g, '');
            configEntrega = d.configEntrega || configEntrega;
            document.getElementById('nomeLoja').innerText = d.nomeNegocio;
        }
        // Lógica de carregar produtos (mantida do seu original)
        const qProd = query(collection(db, "produtos"), where("userId", "==", userId));
        const pSnap = await getDocs(qProd);
        // ... (renderização de produtos omitida aqui para brevidade, mantenha a sua que funcionava)
    } catch (e) { console.error(e); }
    finally { document.getElementById('loading-overlay').classList.add('loader-hidden'); }
}
inicializar();
