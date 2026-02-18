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
    increment 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const listaPedidos = document.getElementById('listaPedidos');
const modal = document.getElementById('modalPedido');
const form = document.getElementById('formPedido');
const selectProduto = document.getElementById('selectProduto');
const containerItens = document.getElementById('itensSelecionados');
const valorTotalPedidoTxt = document.getElementById('valorTotalPedido');

let itensNoCarrinho = [];
let produtosDisponiveis = [];
let filtroStatus = "Todos";
const formatador = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// --- 1. PREFERÊNCIAS E NOME DINÂMICO ---
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

// --- 2. CARREGAR PRODUTOS PARA O SELECT ---
async function carregarProdutosSelect(user) {
    try {
        const q = query(collection(db, "produtos"), where("userId", "==", user.uid));
        const snap = await getDocs(q);
        produtosDisponiveis = [];
        selectProduto.innerHTML = '<option value="">Selecione um produto...</option>';
        
        snap.forEach(doc => {
            const p = doc.data();
            produtosDisponiveis.push({ id: doc.id, ...p });
            selectProduto.innerHTML += `<option value="${doc.id}">${p.nome} - ${formatador.format(p.preco)}</option>`;
        });
    } catch (e) { console.error("Erro ao carregar produtos:", e); }
}

// --- 3. LÓGICA DO CARRINHO ---
selectProduto.onchange = (e) => {
    const produtoId = e.target.value;
    if (!produtoId) return;

    const produto = produtosDisponiveis.find(p => p.id === produtoId);
    const itemExistente = itensNoCarrinho.find(item => item.id === produtoId);

    if (itemExistente) {
        itemExistente.qtd++;
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
            <div class="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-2 animate-in fade-in slide-in-from-right-4 duration-300">
                <div class="flex items-center gap-3">
                    <div class="bg-brand/10 text-brand w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs">
                        ${item.qtd}x
                    </div>
                    <div>
                        <p class="text-xs font-extrabold text-slate-700 uppercase tracking-tight">${item.nome}</p>
                        <p class="text-[10px] text-slate-400 font-bold">${formatador.format(item.preco)} cada</p>
                    </div>
                </div>
                <button type="button" onclick="removerItem(${index})" class="text-slate-300 hover:text-red-500 transition-colors p-2">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        `;
    });

    valorTotalPedidoTxt.innerText = formatador.format(total);
    if (window.lucide) lucide.createIcons();
}

window.removerItem = (index) => {
    itensNoCarrinho.splice(index, 1);
    renderizarCarrinho();
};

// --- 4. CARREGAR PEDIDOS COM FILTROS ---
async function carregarPedidos() {
    const user = auth.currentUser;
    if (!user) return;

    listaPedidos.innerHTML = `
        <div class="col-span-full py-20 text-center">
            <div class="w-12 h-12 border-4 border-slate-100 border-t-brand rounded-full animate-spin mx-auto mb-4"></div>
            <p class="text-slate-400 font-bold italic text-sm tracking-wide">Sincronizando registros...</p>
        </div>`;

    try {
        const q = query(collection(db, "pedidos"), where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        let pedidosArray = [];
        
        querySnapshot.forEach(docSnap => {
            pedidosArray.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Ordenação por data (mais recente primeiro)
        pedidosArray.sort((a, b) => {
            const dateA = a.createdAt?.seconds || 0;
            const dateB = b.createdAt?.seconds || 0;
            return dateB - dateA;
        });

        if (filtroStatus !== "Todos") {
            pedidosArray = pedidosArray.filter(p => p.status === filtroStatus);
        }

        listaPedidos.innerHTML = "";

        if (pedidosArray.length === 0) {
            listaPedidos.innerHTML = `
                <div class="col-span-full py-20 text-center">
                    <i data-lucide="inbox" class="w-12 h-12 text-slate-200 mx-auto mb-4"></i>
                    <p class="text-slate-400 font-medium italic">Nenhum pedido encontrado em "${filtroStatus}".</p>
                </div>`;
            if(window.lucide) lucide.createIcons();
            return;
        }

        pedidosArray.forEach(p => {
            const itensStr = p.itens ? p.itens.map(i => `<span class="block">• ${i.qtd}x ${i.nome}</span>`).join('') : "Pedido sem detalhes";
            const isOnline = p.origem === "Online";
            const isPendente = p.status === "Pendente";

            const badgeOrigem = isOnline ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600";
            const badgeStatus = isPendente ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-green-50 text-green-600 border-green-100";

            listaPedidos.innerHTML += `
                <div class="bg-white p-7 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300">
                    <div class="flex justify-between items-start mb-6">
                        <div class="flex flex-col gap-2">
                            <span class="text-[9px] w-fit font-black uppercase px-2.5 py-1 rounded-lg ${badgeOrigem} tracking-widest">
                                ${p.origem || 'Balcão'}
                            </span>
                            <span class="text-[9px] w-fit font-black uppercase px-2.5 py-1 rounded-lg border ${badgeStatus} tracking-widest">
                                ${p.status}
                            </span>
                        </div>
                        <div class="flex gap-1">
                            ${isPendente ? `
                                <button onclick="finalizarPedido('${p.id}')" class="bg-green-500 text-white p-2.5 rounded-xl hover:bg-green-600 shadow-lg shadow-green-200 transition-all group" title="Concluir Venda">
                                    <i data-lucide="check" class="w-4 h-4"></i>
                                </button>` : ''}
                            <button onclick="excluirPedido('${p.id}')" class="text-slate-300 hover:text-red-500 hover:bg-red-50 p-2.5 rounded-xl transition-all" title="Excluir Registro">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </div>
                    
                    <h4 class="font-black text-slate-800 leading-tight text-xl mb-1 tracking-tighter">${p.cliente || 'Consumidor Final'}</h4>
                    <p class="text-[10px] text-slate-400 font-bold uppercase tracking-[0.15em] mb-4">${p.horaEntrega || 'Horário não registrado'}</p>

                    <div class="bg-slate-50/50 p-5 rounded-[1.5rem] mb-6 border border-slate-100/50 flex-1">
                        <p class="text-[9px] text-slate-400 font-black uppercase mb-3 tracking-widest">Itens do Pedido</p>
                        <div class="text-xs text-slate-600 font-bold leading-relaxed space-y-1">${itensStr}</div>
                    </div>

                    <div class="flex justify-between items-center pt-5 border-t border-dashed border-slate-200">
                        <div class="flex flex-col">
                            <span class="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">Total Geral</span>
                            <span class="text-2xl font-black text-brand tracking-tighter">${formatador.format(p.total)}</span>
                        </div>
                        <div class="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                             <i data-lucide="receipt" class="w-5 h-5"></i>
                        </div>
                    </div>
                </div>
            `;
        });
        if (window.lucide) lucide.createIcons();
    } catch (e) { console.error("Erro ao carregar pedidos:", e); }
}

// --- 5. LÓGICA DOS FILTROS ---
document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    
    const texto = btn.innerText.trim();
    if (['Todos', 'Pendentes', 'Concluídos'].includes(texto)) {
        filtroStatus = texto === "Todos" ? "Todos" : (texto === "Pendentes" ? "Pendente" : "Concluído");

        // Resetar botões
        document.querySelectorAll('button').forEach(b => {
            if (['Todos', 'Pendentes', 'Concluídos'].includes(b.innerText.trim())) {
                b.className = "px-8 py-3 bg-white text-slate-400 rounded-2xl text-xs font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-all";
            }
        });

        // Ativar clicado
        btn.className = "px-8 py-3 bg-brand text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-500/20";
        carregarPedidos();
    }
});

// --- 6. FINALIZAR VENDA (BALCÃO) ---
form.onsubmit = async (e) => {
    e.preventDefault();
    if (itensNoCarrinho.length === 0) return Swal.fire("Carrinho Vazio", "Selecione ao menos um produto para vender.", "warning");

    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerHTML = `<span class="flex items-center gap-2"><div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> PROCESSANDO...</span>`;

    const totalVenda = itensNoCarrinho.reduce((acc, i) => acc + (i.preco * i.qtd), 0);

    const novoPedido = {
        cliente: document.getElementById('cliente').value || "Consumidor Balcão",
        itens: itensNoCarrinho,
        total: totalVenda,
        userId: auth.currentUser.uid,
        origem: "Balcão",
        status: "Concluído",
        createdAt: new Date(),
        horaEntrega: new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})
    };

    try {
        await addDoc(collection(db, "pedidos"), novoPedido);

        // BAIXA NO ESTOQUE
        for (const item of itensNoCarrinho) {
            const produtoRef = doc(db, "produtos", item.id);
            await updateDoc(produtoRef, {
                estoqueAtual: increment(-item.qtd)
            });
        }

        Swal.fire({
            title: "Venda Realizada!",
            text: "O estoque foi atualizado automaticamente.",
            icon: "success",
            confirmButtonColor: "#2563eb"
        });

        modal.classList.add('hidden');
        itensNoCarrinho = [];
        form.reset();
        renderizarCarrinho();
        carregarPedidos();
    } catch (e) { 
        console.error(e); 
        Swal.fire("Erro", "Falha ao registrar venda.", "error");
    } finally { 
        btn.disabled = false; 
        btn.innerText = originalText;
    }
};

// --- 7. AÇÕES DE PEDIDO ---
window.finalizarPedido = async (id) => {
    const result = await Swal.fire({
        title: 'Concluir Venda?',
        text: "O status passará para Concluído.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sim, concluir',
        confirmButtonColor: '#22c55e',
        cancelButtonColor: '#64748b'
    });

    if(result.isConfirmed) {
        try {
            await updateDoc(doc(db, "pedidos", id), { status: "Concluído" });
            carregarPedidos();
        } catch (e) { console.error(e); }
    }
};

window.excluirPedido = async (id) => {
    const result = await Swal.fire({
        title: 'Remover Registro?',
        text: "Essa ação é irreversível.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sim, excluir',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b'
    });

    if(result.isConfirmed) {
        try {
            await deleteDoc(doc(db, "pedidos", id));
            carregarPedidos();
        } catch (e) { console.error(e); }
    }
};

// --- INICIALIZAÇÃO ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        carregarPreferencias(user);
        carregarProdutosSelect(user);
        carregarPedidos();
    } else {
        window.location.href = "index.html";
    }
});

// Modal Control
document.getElementById('abrirModalPedido').onclick = () => {
    itensNoCarrinho = [];
    renderizarCarrinho();
    modal.classList.remove('hidden');
};
document.getElementById('fecharModalPedido').onclick = () => modal.classList.add('hidden');
document.getElementById('btnSairDesktop')?.addEventListener('click', () => signOut(auth));
