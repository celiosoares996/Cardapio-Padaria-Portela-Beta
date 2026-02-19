import { db, auth } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where, 
    deleteDoc, 
    doc, 
    getDoc,
    updateDoc,
    increment,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Elementos do DOM
const listaPedidos = document.getElementById('listaPedidos');
const modal = document.getElementById('modalPedido');
const form = document.getElementById('formPedido');
const selectProduto = document.getElementById('selectProduto');
const containerItens = document.getElementById('itensSelecionados');
const valorTotalPedidoTxt = document.getElementById('valorTotalPedido');

// Estado da Aplicação
let itensNoCarrinho = [];
let produtosDisponiveis = [];
let filtroStatus = "Todos";
const formatador = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// --- 1. PREFERÊNCIAS E TEMA ---
async function carregarPreferencias(user) {
    try {
        const docRef = doc(db, "usuarios", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const dados = docSnap.data();
            const nomeLoja = dados.nomeNegocio || "Meu Negócio";
            document.querySelectorAll('#navNomeNegocio, #sideNomeNegocio').forEach(el => el.innerText = nomeLoja);
            if (dados.corTema) document.documentElement.style.setProperty('--cor-primaria', dados.corTema);
        }
    } catch (e) { console.error("Erro ao carregar preferências:", e); }
}

// --- 2. CARREGAR PRODUTOS ---
async function carregarProdutosSelect(user) {
    try {
        const q = query(collection(db, "produtos"), where("userId", "==", user.uid));
        const snap = await getDocs(q);
        produtosDisponiveis = [];
        selectProduto.innerHTML = '<option value="">Selecione um produto...</option>';
        
        snap.forEach(docSnap => {
            const p = docSnap.data();
            const estoque = p.estoqueAtual || 0;
            produtosDisponiveis.push({ id: docSnap.id, ...p });
            
            const disabled = estoque <= 0 ? 'disabled' : '';
            const textoEstoque = estoque <= 0 ? '(ESGOTADO)' : `(Qtd: ${estoque})`;
            
            selectProduto.innerHTML += `
                <option value="${docSnap.id}" ${disabled}>
                    ${p.nome} - ${formatador.format(p.preco || 0)} ${textoEstoque}
                </option>`;
        });
    } catch (e) { console.error("Erro ao carregar produtos:", e); }
}

// --- 3. LÓGICA DO CARRINHO (BALCÃO) ---
selectProduto.onchange = (e) => {
    const produtoId = e.target.value;
    if (!produtoId) return;

    const produto = produtosDisponiveis.find(p => p.id === produtoId);
    const itemNoCarrinho = itensNoCarrinho.find(item => item.id === produtoId);
    const qtdAtualNoCarrinho = itemNoCarrinho ? itemNoCarrinho.qtd : 0;

    if (produto.estoqueAtual <= qtdAtualNoCarrinho) {
        Swal.fire({ icon: 'error', title: 'Estoque Insuficiente', text: `Limite de ${produto.nome} atingido.` });
        e.target.value = "";
        return;
    }

    if (itemNoCarrinho) {
        itemNoCarrinho.qtd++;
    } else {
        itensNoCarrinho.push({ 
            id: produto.id, 
            nome: produto.nome, 
            preco: parseFloat(produto.preco) || 0, 
            qtd: 1 
        });
    }
    
    e.target.value = "";
    renderizarCarrinho();
};

function renderizarCarrinho() {
    containerItens.innerHTML = "";
    let total = 0;
    itensNoCarrinho.forEach((item, index) => {
        total += item.preco * item.qtd;
        containerItens.innerHTML += `
            <div class="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-2">
                <div class="flex items-center gap-3">
                    <div class="bg-brand text-white px-2 py-1 rounded-lg font-black text-[10px]">${item.qtd}x</div>
                    <div>
                        <p class="text-xs font-extrabold text-slate-700 uppercase">${item.nome}</p>
                        <p class="text-[10px] text-slate-400 font-bold">${formatador.format(item.preco)}</p>
                    </div>
                </div>
                <button type="button" onclick="removerItem(${index})" class="text-slate-300 hover:text-red-500 transition-colors">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>`;
    });
    valorTotalPedidoTxt.innerText = formatador.format(total);
    if (window.lucide) lucide.createIcons();
}

window.removerItem = (index) => {
    itensNoCarrinho.splice(index, 1);
    renderizarCarrinho();
};

// --- 4. RENDERIZAÇÃO DE PEDIDOS (DASHBOARD) ---
async function carregarPedidos() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const q = query(collection(db, "pedidos"), where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        let pedidosArray = [];
        
        querySnapshot.forEach(docSnap => {
            pedidosArray.push({ id: docSnap.id, ...docSnap.data() });
        });

        pedidosArray.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        if (filtroStatus !== "Todos") {
            pedidosArray = pedidosArray.filter(p => p.status === filtroStatus);
        }

        listaPedidos.innerHTML = "";

        if (pedidosArray.length === 0) {
            listaPedidos.innerHTML = `
                <div class="col-span-full py-20 text-center">
                    <i data-lucide="inbox" class="w-12 h-12 text-slate-200 mx-auto mb-4"></i>
                    <p class="text-slate-400 font-medium italic">Nenhum pedido encontrado nesta categoria.</p>
                </div>`;
            if (window.lucide) lucide.createIcons();
            return;
        }

        pedidosArray.forEach(p => {
            const itensHtml = p.itens ? p.itens.map(i => `
                <div class="flex justify-between text-[11px] mb-1">
                    <span class="font-medium text-slate-600">${i.qtd}x ${i.nome}</span>
                    <span class="font-bold text-slate-800">${formatador.format((i.preco || 0) * i.qtd)}</span>
                </div>
            `).join('') : "Sem itens";

            const statusConfig = {
                "Pendente": "bg-amber-100 text-amber-700",
                "Preparo": "bg-blue-100 text-blue-700",
                "Entrega": "bg-purple-100 text-purple-700",
                "Concluído": "bg-green-100 text-green-700"
            };

            const corStatus = statusConfig[p.status] || "bg-slate-100 text-slate-600";
            const zapLink = p.clienteTelefone ? `https://wa.me/55${p.clienteTelefone.replace(/\D/g,'')}` : "#";

            listaPedidos.innerHTML += `
                <div class="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col group hover:shadow-xl transition-all duration-300">
                    <div class="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                        <div>
                            <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Status do Pedido</span>
                            <select onchange="atualizarStatusPedido('${p.id}', this.value)" class="block mt-1 text-[10px] font-black uppercase px-3 py-1.5 rounded-full ${corStatus} border-none outline-none cursor-pointer">
                                <option value="Pendente" ${p.status === 'Pendente' ? 'selected' : ''}>Pendente</option>
                                <option value="Preparo" ${p.status === 'Preparo' ? 'selected' : ''}>Em Preparo</option>
                                <option value="Entrega" ${p.status === 'Entrega' ? 'selected' : ''}>Saiu p/ Entrega</option>
                                <option value="Concluído" ${p.status === 'Concluído' ? 'selected' : ''}>Concluído</option>
                            </select>
                        </div>
                        <div class="flex gap-2">
                            ${p.clienteTelefone ? `<a href="${zapLink}" target="_blank" class="w-8 h-8 bg-green-500 text-white rounded-xl flex items-center justify-center hover:scale-110 transition-transform"><i data-lucide="phone" class="w-4 h-4"></i></a>` : ''}
                            <button onclick="excluirPedido('${p.id}')" class="w-8 h-8 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    </div>

                    <div class="p-6 space-y-4 flex-1">
                        <div>
                            <h4 class="font-black text-slate-800 text-lg leading-tight">${p.cliente || 'Consumidor Final'}</h4>
                            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">${p.origem || 'Balcão'} • ${p.horaEntrega || '--:--'}</p>
                        </div>

                        <div class="bg-slate-50 rounded-2xl p-4 border border-slate-100/50">
                            ${itensHtml}
                            ${p.observacao ? `
                                <div class="mt-3 p-2 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg">
                                    <p class="text-[10px] font-bold text-amber-700 uppercase italic">Obs: ${p.observacao}</p>
                                </div>
                            ` : ''}
                        </div>

                        ${p.tipo === 'delivery' ? `
                            <div class="flex items-center gap-2 p-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
                                <i data-lucide="map-pin" class="w-3 h-3 text-blue-500"></i>
                                <p class="text-[10px] font-medium text-blue-700 truncate">${p.endereco || 'Endereço não informado'}</p>
                            </div>
                        ` : ''}
                    </div>

                    <div class="p-6 pt-0 mt-auto">
                        <div class="flex justify-between items-end border-t border-dashed border-slate-200 pt-4">
                            <div>
                                <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total</span>
                                <p class="text-2xl font-black text-brand leading-none">${formatador.format(p.total || 0)}</p>
                            </div>
                            <span class="text-[9px] font-bold text-slate-300 uppercase">${p.pagamentoMetodo || 'A definir'}</span>
                        </div>
                    </div>
                </div>`;
        });
        if (window.lucide) lucide.createIcons();
    } catch (e) { console.error("Erro ao listar pedidos:", e); }
}

// --- 5. AÇÕES ---
window.atualizarStatusPedido = async (id, novoStatus) => {
    try {
        await updateDoc(doc(db, "pedidos", id), { status: novoStatus });
        carregarPedidos();
    } catch (e) { console.error(e); }
};

window.excluirPedido = async (id) => {
    const confirm = await Swal.fire({ 
        title: 'Excluir Pedido?', 
        icon: 'warning',
        showCancelButton: true, 
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Confirmar Exclusão',
        cancelButtonText: 'Voltar'
    });

    if(confirm.isConfirmed) {
        try {
            await deleteDoc(doc(db, "pedidos", id));
            carregarPedidos();
        } catch (e) { console.error(e); }
    }
};

// --- 6. FINALIZAR VENDA BALCÃO ---
form.onsubmit = async (e) => {
    e.preventDefault();
    if (itensNoCarrinho.length === 0) return;

    const totalVenda = itensNoCarrinho.reduce((acc, i) => acc + (i.preco * i.qtd), 0);
    const novoPedido = {
        cliente: document.getElementById('cliente').value || "Cliente Balcão",
        itens: itensNoCarrinho,
        total: totalVenda,
        userId: auth.currentUser.uid,
        origem: "Balcão",
        status: "Concluído",
        createdAt: serverTimestamp(),
        horaEntrega: new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}),
        pagamentoMetodo: "Dinheiro/Cartão"
    };

    try {
        await addDoc(collection(db, "pedidos"), novoPedido);
        for (const item of itensNoCarrinho) {
            await updateDoc(doc(db, "produtos", item.id), { estoqueAtual: increment(-item.qtd) });
        }
        fecharModalEPrincipal();
        carregarPedidos();
        carregarProdutosSelect(auth.currentUser);
        Swal.fire({ icon: 'success', title: 'Venda Realizada!', showConfirmButton: false, timer: 1500 });
    } catch (e) { console.error(e); }
};

// --- CONFIGURAÇÃO DE FILTROS ---
function configurarFiltros() {
    const botoes = document.querySelectorAll('#containerFiltros button');
    botoes.forEach(btn => {
        btn.onclick = () => {
            filtroStatus = btn.getAttribute('data-filter') === 'todos' ? 'Todos' : 
                          btn.getAttribute('data-filter') === 'novo' ? 'Pendente' : 
                          btn.getAttribute('data-filter') === 'preparo' ? 'Preparo' : 'Concluído';
            
            botoes.forEach(b => b.className = "px-6 py-3 bg-white text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-200 whitespace-nowrap");
            btn.className = "px-6 py-3 bg-brand text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 whitespace-nowrap";
            
            carregarPedidos();
        };
    });
}

function fecharModalEPrincipal() {
    modal.classList.add('hidden');
    itensNoCarrinho = [];
    form.reset();
    renderizarCarrinho();
}

// --- INICIALIZAÇÃO ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        carregarPreferencias(user);
        carregarProdutosSelect(user);
        carregarPedidos();
        configurarFiltros(); 
    } else {
        window.location.href = "index.html";
    }
});
