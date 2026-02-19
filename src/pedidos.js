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
            const textoEstoque = estoque <= 0 ? '(ESGOTADO)' : `(Estoque: ${estoque})`;
            
            selectProduto.innerHTML += `
                <option value="${docSnap.id}" ${disabled}>
                    ${p.nome} - ${formatador.format(p.preco)} ${textoEstoque}
                </option>`;
        });
    } catch (e) { console.error("Erro ao carregar produtos:", e); }
}

// --- 3. LÓGICA DO CARRINHO ---
selectProduto.onchange = (e) => {
    const produtoId = e.target.value;
    if (!produtoId) return;

    const produto = produtosDisponiveis.find(p => p.id === produtoId);
    const itemNoCarrinho = itensNoCarrinho.find(item => item.id === produtoId);
    const qtdAtualNoCarrinho = itemNoCarrinho ? itemNoCarrinho.qtd : 0;

    if (produto.estoqueAtual <= qtdAtualNoCarrinho) {
        Swal.fire("Estoque Insuficiente", `Você já adicionou o limite disponível de ${produto.nome}.`, "warning");
        e.target.value = "";
        return;
    }

    if (itemNoCarrinho) {
        itemNoCarrinho.qtd++;
    } else {
        itensNoCarrinho.push({ id: produto.id, nome: produto.nome, preco: parseFloat(produto.preco), qtd: 1 });
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
                    <div class="bg-brand text-white w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs">${item.qtd}x</div>
                    <div>
                        <p class="text-xs font-extrabold text-slate-700 uppercase">${item.nome}</p>
                        <p class="text-[10px] text-slate-400 font-bold">${formatador.format(item.preco)}</p>
                    </div>
                </div>
                <button type="button" onclick="removerItem(${index})" class="text-slate-300 hover:text-red-500 p-2">
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

// --- 4. CARREGAR PEDIDOS (COM MENSAGENS DINÂMICAS) ---
async function carregarPedidos() {
    const user = auth.currentUser;
    if (!user) return;

    listaPedidos.innerHTML = `
        <div class="col-span-full py-20 text-center">
            <div class="w-12 h-12 border-4 border-slate-100 border-t-brand rounded-full animate-spin mx-auto mb-4"></div>
            <p class="text-slate-400 font-bold italic">Sincronizando banco de dados...</p>
        </div>`;

    try {
        const q = query(collection(db, "pedidos"), where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        let pedidosArray = [];
        
        querySnapshot.forEach(docSnap => {
            pedidosArray.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Ordenar por data (mais recentes primeiro)
        pedidosArray.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        // Filtragem Logística
        if (filtroStatus !== "Todos") {
            pedidosArray = pedidosArray.filter(p => p.status === filtroStatus);
        }

        listaPedidos.innerHTML = "";

        // Verificação de Lista Vazia com Mensagem Dinâmica
        if (pedidosArray.length === 0) {
            let msg = "";
            if (filtroStatus === "Todos") msg = "Nenhum pedido registrado ainda.";
            else if (filtroStatus === "Pendente") msg = "Nenhum pedido pendente por aqui.";
            else if (filtroStatus === "Concluído") msg = "Você ainda não possui vendas concluídas.";

            listaPedidos.innerHTML = `
                <div class="col-span-full py-20 text-center animate-pulse">
                    <i data-lucide="inbox" class="w-12 h-12 text-slate-200 mx-auto mb-4"></i>
                    <p class="text-slate-400 font-medium italic">${msg}</p>
                </div>`;
            if (window.lucide) lucide.createIcons();
            return;
        }

        // Renderização dos Cards
        pedidosArray.forEach(p => {
            const itensHtml = p.itens ? p.itens.map(i => `<div class="flex justify-between text-[11px] mb-1"><span>${i.qtd}x ${i.nome}</span><span>${formatador.format(i.preco * i.qtd)}</span></div>`).join('') : "";
            const badgeOrigem = p.origem === "Online" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600";
            const badgeStatus = p.status === "Pendente" ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-green-50 text-green-600 border-green-100";

            listaPedidos.innerHTML += `
                <div class="bg-white p-7 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col hover:shadow-md transition-shadow">
                    <div class="flex justify-between items-start mb-6">
                        <div class="flex flex-col gap-2">
                            <span class="text-[9px] font-black uppercase px-2.5 py-1 rounded-lg ${badgeOrigem}">${p.origem || 'Balcão'}</span>
                            <span class="text-[9px] font-black uppercase px-2.5 py-1 rounded-lg border ${badgeStatus}">${p.status}</span>
                        </div>
                        <div class="flex gap-1">
                            ${p.status === 'Pendente' ? `<button onclick="finalizarPedido('${p.id}')" class="bg-green-500 text-white p-2.5 rounded-xl hover:bg-green-600 transition-colors"><i data-lucide="check" class="w-4 h-4"></i></button>` : ''}
                            <button onclick="excluirPedido('${p.id}')" class="text-slate-300 hover:text-red-500 p-2.5 rounded-xl transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    </div>
                    <h4 class="font-black text-slate-800 text-xl mb-1">${p.cliente || 'Consumidor Final'}</h4>
                    <div class="bg-slate-50/50 p-5 rounded-[1.5rem] mb-6 flex-1 text-slate-500 border border-slate-100/50">${itensHtml}</div>
                    <div class="flex justify-between items-center pt-5 border-t border-dashed border-slate-200">
                        <span class="text-2xl font-black text-brand">${formatador.format(p.total)}</span>
                        <span class="text-[10px] text-slate-300 font-bold uppercase">${p.horaEntrega || ''}</span>
                    </div>
                </div>`;
        });
        if (window.lucide) lucide.createIcons();
    } catch (e) { console.error("Erro ao listar pedidos:", e); }
}

// --- 5. LÓGICA DE FILTROS ---
function configurarFiltros() {
    const containerFiltros = document.querySelector('.overflow-x-auto.pb-6');
    if (!containerFiltros) return;

    const botoes = containerFiltros.querySelectorAll('button');

    botoes.forEach(btn => {
        btn.addEventListener('click', () => {
            const texto = btn.innerText.trim();
            
            // Atualiza o filtro global
            if (texto === "Todos") filtroStatus = "Todos";
            else if (texto === "Pendentes") filtroStatus = "Pendente";
            else if (texto === "Concluídos") filtroStatus = "Concluído";

            // Reset visual dos botões
            botoes.forEach(b => {
                b.className = "px-8 py-3 bg-white text-slate-400 rounded-2xl text-xs font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-all";
            });

            // Ativa o botão selecionado
            btn.className = "px-8 py-3 bg-brand text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-500/20";

            // Recarrega os dados com o novo filtro
            carregarPedidos();
        });
    });
}

// --- 6. FINALIZAR VENDA BALCÃO ---
form.onsubmit = async (e) => {
    e.preventDefault();
    if (itensNoCarrinho.length === 0) return;

    const btnSubmit = form.querySelector('button[type="submit"]');
    btnSubmit.disabled = true;

    const totalVenda = itensNoCarrinho.reduce((acc, i) => acc + (i.preco * i.qtd), 0);
    const novoPedido = {
        cliente: document.getElementById('cliente').value || "Consumidor Balcão",
        itens: itensNoCarrinho,
        total: totalVenda,
        userId: auth.currentUser.uid,
        origem: "Balcão",
        status: "Concluído",
        createdAt: serverTimestamp(),
        horaEntrega: new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})
    };

    try {
        await addDoc(collection(db, "pedidos"), novoPedido);
        for (const item of itensNoCarrinho) {
            await updateDoc(doc(db, "produtos", item.id), { estoqueAtual: increment(-item.qtd) });
        }
        fecharEPrincipal();
        carregarPedidos();
        carregarProdutosSelect(auth.currentUser);
    } catch (e) { 
        console.error(e);
        Swal.fire("Erro", "Não foi possível registrar a venda.", "error");
    } finally { 
        btnSubmit.disabled = false; 
    }
};

// --- AÇÕES DE ATUALIZAÇÃO ---
window.finalizarPedido = async (id) => {
    try {
        await updateDoc(doc(db, "pedidos", id), { status: "Concluído" });
        carregarPedidos();
    } catch (e) { console.error(e); }
};

window.excluirPedido = async (id) => {
    const confirm = await Swal.fire({ 
        title: 'Excluir Pedido?', 
        text: "Esta ação não pode ser desfeita!",
        icon: 'warning',
        showCancelButton: true, 
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#cbd5e1',
        confirmButtonText: 'Sim, excluir',
        cancelButtonText: 'Cancelar'
    });

    if(confirm.isConfirmed) {
        try {
            await deleteDoc(doc(db, "pedidos", id));
            carregarPedidos();
        } catch (e) { console.error(e); }
    }
};

function fecharEPrincipal() {
    modal.classList.add('hidden');
    itensNoCarrinho = [];
    form.reset();
    renderizarCarrinho();
}

document.getElementById('abrirModalPedido').onclick = () => {
    itensNoCarrinho = [];
    renderizarCarrinho();
    modal.classList.remove('hidden');
};

document.getElementById('fecharModalPedido').onclick = fecharEPrincipal;
document.getElementById('btnSairDesktop')?.addEventListener('click', () => signOut(auth));

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

