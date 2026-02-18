import { db, auth } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where, 
    orderBy, 
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
let filtroStatus = "Todos"; // Controle do filtro atual
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
    } catch (e) { console.error("Erro ao carregar produtos para select:", e); }
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
            <div class="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100 mb-2">
                <div>
                    <p class="text-xs font-bold text-slate-700">${item.nome}</p>
                    <p class="text-[10px] text-brand font-bold">${item.qtd}x ${formatador.format(item.preco)}</p>
                </div>
                <button type="button" onclick="removerItem(${index})" class="text-red-400 hover:text-red-600 font-bold px-2">✕</button>
            </div>
        `;
    });

    valorTotalPedidoTxt.innerText = formatador.format(total);
}

window.removerItem = (index) => {
    itensNoCarrinho.splice(index, 1);
    renderizarCarrinho();
};

// --- 4. CARREGAR PEDIDOS COM FILTROS ---
async function carregarPedidos() {
    const user = auth.currentUser;
    if (!user) return;

    listaPedidos.innerHTML = `<div class="col-span-full py-10 text-center animate-pulse"><p class="text-slate-400 font-bold">Carregando...</p></div>`;

    try {
        // Ajustamos a query para evitar erros de índice se não houver configurações no console do Firebase
        let q = query(
            collection(db, "pedidos"), 
            where("userId", "==", user.uid)
        );

        const querySnapshot = await getDocs(q);
        let pedidosArray = [];
        
        querySnapshot.forEach(docSnap => {
            pedidosArray.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Ordenação manual (mais seguro que orderBy do Firebase para começar)
        pedidosArray.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());

        // Filtragem manual
        if (filtroStatus !== "Todos") {
            pedidosArray = pedidosArray.filter(p => p.status === filtroStatus);
        }

        listaPedidos.innerHTML = "";

        if (pedidosArray.length === 0) {
            listaPedidos.innerHTML = `<div class="col-span-full py-20 text-center"><p class="text-slate-400 italic">Nenhum pedido em "${filtroStatus}".</p></div>`;
            return;
        }

        pedidosArray.forEach(p => {
            const itensStr = p.itens ? p.itens.map(i => `${i.qtd}x ${i.nome}`).join('<br>') : "Pedido s/ detalhes";
            const badgeOrigem = p.origem === "Online" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600";
            const badgeStatus = p.status === "Pendente" ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-green-50 text-green-600 border-green-100";

            listaPedidos.innerHTML += `
                <div class="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-50 flex flex-col hover:scale-[1.01] transition-all">
                    <div class="flex justify-between items-start mb-4">
                        <div class="flex flex-col gap-1">
                            <span class="text-[9px] w-fit font-black uppercase px-2 py-0.5 rounded-lg ${badgeOrigem}">${p.origem || 'Balcão'}</span>
                            <span class="text-[9px] w-fit font-black uppercase px-2 py-0.5 rounded-lg border ${badgeStatus}">${p.status}</span>
                        </div>
                        <div class="flex gap-2">
                            ${p.status === "Pendente" ? `<button onclick="finalizarPedido('${p.id}')" class="bg-green-500 text-white text-[10px] font-black p-2 rounded-xl px-3 hover:bg-green-600 transition-all">CONCLUIR</button>` : ''}
                            <button onclick="excluirPedido('${p.id}')" class="text-red-300 hover:text-red-500 transition-colors p-2 text-xs">✕</button>
                        </div>
                    </div>
                    
                    <h4 class="font-black text-slate-800 leading-tight text-lg mb-1">${p.cliente || 'Consumidor'}</h4>
                    <div class="bg-slate-50 p-4 rounded-2xl mb-4 border border-slate-100 flex-1">
                        <p class="text-[10px] text-slate-400 font-black uppercase mb-2 tracking-widest">Detalhes do Pedido</p>
                        <p class="text-xs text-slate-600 font-bold leading-relaxed">${itensStr}</p>
                    </div>

                    <div class="flex justify-between items-center mt-auto pt-4 border-t border-dashed border-slate-100">
                        <span class="text-xl font-black text-brand">${formatador.format(p.total)}</span>
                        <div class="text-right">
                             <p class="text-[9px] font-black text-slate-300 uppercase leading-none">Entrega/Venda em</p>
                             <p class="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">${p.horaEntrega || ''}</p>
                        </div>
                    </div>
                </div>
            `;
        });
    } catch (e) { console.error("Erro ao carregar pedidos:", e); }
}

// --- 5. LÓGICA DOS FILTROS (BOTÕES TODOS, PENDENTES, CONCLUÍDOS) ---
document.addEventListener('click', (e) => {
    if (e.target.matches('button') && ['Todos', 'Pendentes', 'Concluídos'].includes(e.target.innerText.trim())) {
        // Pegar o status clicado
        const selecionado = e.target.innerText.trim();
        filtroStatus = selecionado === "Todos" ? "Todos" : (selecionado === "Pendentes" ? "Pendente" : "Concluído");

        // Resetar visual de todos os botões de filtro
        document.querySelectorAll('button').forEach(btn => {
            if (['Todos', 'Pendentes', 'Concluídos'].includes(btn.innerText.trim())) {
                btn.className = "px-6 py-2 bg-white text-slate-400 rounded-full text-xs font-black uppercase tracking-wider border border-slate-100 hover:bg-slate-50 transition";
            }
        });

        // Aplicar visual de ativo no clicado
        e.target.className = "px-6 py-2 bg-brand text-white rounded-full text-xs font-black uppercase tracking-wider shadow-md";
        
        carregarPedidos();
    }
});

// --- 6. FINALIZAR VENDA (BALCÃO) ---
form.onsubmit = async (e) => {
    e.preventDefault();
    if (itensNoCarrinho.length === 0) return Swal.fire("Atenção", "O carrinho está vazio!", "warning");

    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "FINALIZANDO...";

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

        Swal.fire("Sucesso!", "Venda finalizada e estoque abatido.", "success");
        modal.classList.add('hidden');
        itensNoCarrinho = [];
        form.reset();
        renderizarCarrinho();
        carregarPedidos();
    } catch (e) { 
        console.error(e); 
        Swal.fire("Erro", "Não foi possível processar a venda.", "error");
    } finally { 
        btn.disabled = false; 
        btn.innerText = originalText;
    }
};

// --- 7. AÇÕES DE PEDIDO (FINALIZAR/EXCLUIR) ---
window.finalizarPedido = async (id) => {
    const result = await Swal.fire({
        title: 'Concluir este pedido?',
        text: "O status será alterado para Concluído.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sim, concluir',
        confirmButtonColor: '#22c55e'
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
        title: 'Excluir registro?',
        text: "Isso não devolverá os itens ao estoque!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Excluir',
        confirmButtonColor: '#ef4444'
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

// Controle de Modal e Logout
document.getElementById('abrirModalPedido').onclick = () => {
    itensNoCarrinho = [];
    renderizarCarrinho();
    modal.classList.remove('hidden');
};
document.getElementById('fecharModalPedido').onclick = () => modal.classList.add('hidden');
document.getElementById('btnSairDesktop')?.addEventListener('click', () => signOut(auth));
