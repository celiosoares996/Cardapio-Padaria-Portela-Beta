import { db } from './firebase-config.js'; 
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

    cepInput.classList.add('animate-pulse');
    if(status) {
        status.innerText = "Buscando endereço...";
        status.classList.remove('hidden', 'text-red-500');
        status.classList.add('text-brand');
    }
    
    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();

        if (data.erro) {
            if(status) {
                status.innerText = "CEP não encontrado!";
                status.classList.add('text-red-500');
            }
            return;
        }

        if(camposEndereco) camposEndereco.classList.remove('hidden');
        if(textoEnderecoAuto) {
            textoEnderecoAuto.innerText = `${data.logradouro}, ${data.bairro} - ${data.localidade}/${data.uf}`;
        }

        enderecoCompleto = { 
            rua: data.logradouro || "", 
            bairro: data.bairro || "", 
            cidade: data.localidade || "", 
            cep: cep 
        };

        if(btnProx2) {
            btnProx2.disabled = false;
            btnProx2.classList.replace('bg-slate-200', 'bg-brand');
        }

        // --- CÁLCULO DE FRETE ---
        if (configEntrega && configEntrega.tipo === 'km') {
            try {
                // Nominatim com cache busting para evitar erro no Netlify
                const geoResp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&postalcode=${cep}&country=Brazil&limit=1&v=${Date.now()}`, {
                    headers: { 'User-Agent': 'CardapioDigitalVacy/1.1' }
                });
                const geoData = await geoResp.json();

                if (geoData && geoData.length > 0) {
                    const latCli = parseFloat(geoData[0].lat);
                    const lonCli = parseFloat(geoData[0].lon);

                    // Pega lat/log da loja garantindo que são números
                    const latLoja = parseFloat(configEntrega.coords.lat);
                    const lonLoja = parseFloat(configEntrega.coords.log || configEntrega.coords.lng);

                    const distancia = calcularDistancia(latLoja, lonLoja, latCli, lonCli);
                    distanciaCliente = distancia;

                    const precoKm = Number(configEntrega.valorKm) || 0;
                    taxaEntregaAtual = parseFloat((distancia * precoKm).toFixed(2));

                    if (configEntrega.raioMaximo > 0 && distancia > Number(configEntrega.raioMaximo)) {
                        alert(`Atenção: Estamos a ${distancia.toFixed(1)}km. Verifique se atendemos sua região.`);
                    }
                } else {
                    taxaEntregaAtual = Number(configEntrega.taxaFixa) || 0;
                }
            } catch (err) {
                console.warn("Erro no Nominatim, usando taxa fixa.");
                taxaEntregaAtual = Number(configEntrega.taxaFixa) || 0;
            }
        } else {
            taxaEntregaAtual = Number(configEntrega?.taxaFixa) || 0;
        }

        renderizarCarrinho();

    } catch (error) {
        console.error("Erro na busca do CEP:", error);
    } finally {
        cepInput.classList.remove('animate-pulse');
        if(status) status.classList.add('hidden');
    }
};

window.atualizarModoPedidoJS = (modo) => {
    modoPedido = modo;
    const btnProx1 = document.getElementById('btnProximo1');
    if (modo === 'retirada') {
        taxaEntregaAtual = 0;
        distanciaCliente = 0;
    } else {
        if (configEntrega && configEntrega.tipo === 'fixo') {
            taxaEntregaAtual = Number(configEntrega.taxaFixa) || 0;
        }
    }
    if(btnProx1) {
        btnProx1.disabled = false;
        btnProx1.classList.replace('bg-slate-200', 'bg-brand');
    }
    renderizarCarrinho();
};

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
        if(badge) badge.innerText = parseInt(carrinho.length);
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
                <span class="text-[9px] font-bold uppercase opacity-60 italic">Total do Pedido</span>
                <span class="font-black text-lg">R$ ${totalGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>`;
    }

    if(resumoF) {
        const textoFrete = (modoPedido === 'retirada') ? 'Grátis (Retirada)' : 
                          (taxaEntregaAtual > 0 ? `R$ ${taxaEntregaAtual.toLocaleString('pt-BR', {minimumFractionDigits: 2})}` : 'Grátis');
        
        resumoF.innerHTML = `
            <div class="space-y-2 text-[11px]">
                <div class="flex justify-between opacity-70"><span>Subtotal:</span><span>R$ ${subtotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span></div>
                <div class="flex justify-between opacity-70">
                    <span>Frete ${distanciaCliente > 0 ? '(' + distanciaCliente.toFixed(1) + 'km)' : ''}:</span>
                    <span class="font-bold">${textoFrete}</span>
                </div>
                <div class="flex justify-between text-base font-black border-t border-white/20 pt-2 mt-2">
                    <span>TOTAL:</span><span>R$ ${totalGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                </div>
            </div>`;
    }
}

window.abrirCarrinho = () => {
    const modal = document.getElementById('modalCarrinho');
    if(modal) modal.classList.remove('hidden');
    if(window.irParaPasso) window.irParaPasso(1);
    renderizarCarrinho();
};

window.fecharCarrinho = () => {
    const modal = document.getElementById('modalCarrinho');
    if(modal) modal.classList.add('hidden');
};

window.enviarWhatsApp = () => {
    const radios = document.getElementsByName('pagamento');
    radios.forEach(r => { if(r.checked) formaPagamento = r.value; });

    if(!formaPagamento) {
        alert("Selecione o pagamento!");
        return;
    }

    let numero = document.getElementById('inputNumero').value;
    if(modoPedido === 'entrega' && !numero) {
        alert("Preencha o número/complemento.");
        return;
    }

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
    texto += `--------------------------------`;
    
    window.open(`https://wa.me/${whatsappLoja.replace(/\D/g,'')}?text=${encodeURIComponent(texto)}`);
};

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
            
            // GARANTE QUE configEntrega NÃO SEJA NULO E CONVERTE VALORES
            configEntrega = d.configEntrega || { coords: {lat:0, log:0}, raioMaximo: 0, valorKm: 0, tipo: 'fixo' };

            document.getElementById('nomeLoja').innerText = d.nomeNegocio || "Minha Loja";
            document.getElementById('nomeLojaRodape').innerText = d.nomeNegocio || "Minha Loja";
            
            if(d.corTema) document.documentElement.style.setProperty('--cor-primaria', d.corTema);
            
            const banner = document.getElementById('bannerLoja');
            if(banner && d.fotoCapa) banner.style.backgroundImage = `url('${d.fotoCapa}')`;
            
            const img = document.getElementById('fotoLoja');
            if(img && d.fotoPerfil) {
                img.src = d.fotoPerfil;
                img.classList.remove('hidden');
                const emoji = document.getElementById('emojiLoja');
                if(emoji) emoji.classList.add('hidden');
            }

            const dotStatus = document.getElementById('dotStatus');
            const labelStatus = document.getElementById('labelStatus');
            lojaAberta = verificarSeEstaAberto(d.horarioAbertura, d.horarioFechamento);
            if (lojaAberta) {
                if(dotStatus) dotStatus.className = "w-2 h-2 rounded-full bg-green-500 ping-aberto";
                if(labelStatus) labelStatus.innerHTML = `<span class="text-green-600 font-bold">Aberto</span> até ${d.horarioFechamento}`;
            } else {
                if(dotStatus) dotStatus.className = "w-2 h-2 rounded-full bg-red-500";
                if(labelStatus) labelStatus.innerHTML = `<span class="text-red-600 font-bold">Fechado</span> abre às ${d.horarioAbertura}`;
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
        if(main && nav) {
            main.innerHTML = ""; nav.innerHTML = "";
            Object.keys(prods).forEach((cat) => {
                nav.innerHTML += `<a href="#${cat.replace(/\s/g, '')}" class="category-tab pb-2 whitespace-nowrap font-bold text-xs uppercase">${cat}</a>`;
                let section = `<section id="${cat.replace(/\s/g, '')}" class="pt-4"><h2 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">${cat}</h2><div class="space-y-3">`;
                prods[cat].forEach(p => {
                    section += `
                        <div class="bg-white p-3 rounded-3xl flex items-center justify-between shadow-sm border border-slate-50">
                            <div class="flex-1 pr-4">
                                <h3 class="text-sm font-bold text-slate-800">${p.nome}</h3>
                                <p class="text-[10px] text-slate-400 mt-0.5 line-clamp-2">${p.descricao || ''}</p>
                                <p class="text-brand font-black mt-2">R$ ${Number(p.preco).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                            </div>
                            <div class="relative w-20 h-20">
                                <img src="${p.foto}" class="w-full h-full object-cover rounded-2xl bg-slate-50">
                                <button onclick="adicionarAoCarrinho('${p.nome}', ${p.preco})" class="absolute -bottom-1 -right-1 w-8 h-8 bg-brand text-white rounded-xl shadow-lg font-bold">+</button>
                            </div>
                        </div>`;
                });
                main.innerHTML += section + `</div></section>`;
            });
        }
        document.getElementById('loading-overlay').classList.add('loader-hidden');
    } catch (e) { console.error(e); }
}

inicializar();
