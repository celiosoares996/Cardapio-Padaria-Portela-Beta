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
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const form = document.getElementById('formEstoque');
const lista = document.getElementById('listaEstoque');
const modal = document.getElementById('modal');
const btnAbrir = document.getElementById('abrirModal');
const btnFechar = document.getElementById('fecharModal');
const modalTitulo = document.getElementById('modalTitulo');
const editIdInput = document.getElementById('editId');

// --- 1. APLICAR TEMA E NOME DINÂMICO ---
async function carregarPreferencias(user) {
    try {
        const docRef = doc(db, "usuarios", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const dados = docSnap.data();
            const nomeLoja = dados.nomeNegocio || "Meu Negócio";
            
            if (document.getElementById('navNomeNegocio')) document.getElementById('navNomeNegocio').innerText = nomeLoja;
            if (document.getElementById('sideNomeNegocio')) document.getElementById('sideNomeNegocio').innerText = nomeLoja;

            const corFinal = dados.corTema || "#2563eb";
            document.documentElement.style.setProperty('--cor-primaria', corFinal);
        }
    } catch (error) {
        console.error("Erro ao carregar preferências:", error);
    }
}

// --- 2. CONTROLE DO MODAL ---
if (btnAbrir) {
    btnAbrir.onclick = () => {
        form.reset();
        editIdInput.value = ""; 
        modalTitulo.innerText = "Novo Insumo";
        modal.classList.remove('hidden');
    };
}

if (btnFechar) {
    btnFechar.onclick = () => modal.classList.add('hidden');
}

// --- 3. BUSCAR ITENS DO ESTOQUE (FOCO EM QUANTIDADE) ---
async function carregarEstoque(user) {
    if (!user) return;

    try {
        const q = query(collection(db, "estoque"), where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        
        lista.innerHTML = ""; 

        if (querySnapshot.empty) {
            lista.innerHTML = `<tr><td colspan="3" class="p-10 text-center text-slate-400 font-medium">Estoque vazio. Adicione insumos! 📦</td></tr>`;
            return;
        }

        querySnapshot.forEach((documento) => {
            const data = documento.data();
            const id = documento.id;
            
            // Lógica de alerta visual para estoque baixo
            const corQuantidade = data.quantidade <= 2 ? 'text-red-500' : 'text-blue-600';

            lista.innerHTML += `
                <tr class="flex flex-col md:table-row p-6 md:p-0 bg-white mb-4 md:mb-0 rounded-[2rem] md:rounded-none border border-slate-100 md:border-none shadow-sm md:shadow-none transition-all">
                    <td class="md:p-8 flex justify-between items-center md:table-cell">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-lg">🍞</div>
                            <div>
                                <p class="font-extrabold text-slate-800 text-lg md:text-base">${data.nome}</p>
                                <p class="md:hidden text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ingrediente</p>
                            </div>
                        </div>
                    </td>
                    <td class="md:p-8 mt-4 md:mt-0 flex justify-between items-center md:table-cell border-t border-slate-50 pt-4 md:pt-0 md:border-none">
                        <span class="md:hidden text-[10px] font-black text-slate-400 uppercase tracking-widest">Qtd. Atual</span>
                        <span class="${corQuantidade} font-black text-xl md:text-lg italic">
                            ${data.quantidade} <small class="text-[10px] text-slate-400 not-italic uppercase">${data.unidade || 'un'}</small>
                        </span>
                    </td>
                    <td class="md:p-8 mt-4 md:mt-0 flex justify-center gap-2 md:table-cell border-t border-slate-50 pt-4 md:pt-0 md:border-none">
                        <div class="flex gap-2 w-full md:justify-center">
                            <button onclick="prepararEdicao('${id}', '${data.nome}', ${data.quantidade}, '${data.unidade}')" 
                                class="flex-1 md:flex-none p-4 md:p-3 bg-slate-100 text-slate-500 rounded-xl hover:bg-brand hover:text-white transition-all flex items-center justify-center gap-2">
                                ✏️ <span class="md:hidden font-bold uppercase text-[10px]">Atualizar</span>
                            </button>
                            <button onclick="deletarItem('${id}')" 
                                class="flex-1 md:flex-none p-4 md:p-3 bg-red-50 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2">
                                🗑️ <span class="md:hidden font-bold uppercase text-[10px]">Remover</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
    } catch (error) {
        console.error("Erro ao buscar estoque:", error);
    }
}

// --- 4. FUNÇÃO PARA ABRIR EDIÇÃO/ATUALIZAÇÃO ---
window.prepararEdicao = (id, nome, quantidade, unidade) => {
    editIdInput.value = id;
    document.getElementById('nomeItem').value = nome;
    document.getElementById('quantidadeItem').value = quantidade;
    document.getElementById('unidadeItem').value = unidade || "un";
    modalTitulo.innerText = "Atualizar Estoque";
    modal.classList.remove('hidden');
};

// --- 5. SALVAR OU ATUALIZAR ITEM ---
form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const user = auth.currentUser;
    if (!user) return;

    const btnSalvar = form.querySelector('button[type="submit"]');
    const idParaEditar = editIdInput.value;
    
    btnSalvar.disabled = true;
    btnSalvar.innerText = "ATUALIZANDO...";

    const dadosItem = {
        nome: document.getElementById('nomeItem').value,
        quantidade: parseFloat(document.getElementById('quantidadeItem').value),
        unidade: document.getElementById('unidadeItem').value,
        userId: user.uid,
        ultimaAtualizacao: serverTimestamp()
    };

    try {
        if (idParaEditar) {
            await updateDoc(doc(db, "estoque", idParaEditar), dadosItem);
        } else {
            dadosItem.dataCriacao = serverTimestamp();
            await addDoc(collection(db, "estoque"), dadosItem);
        }
        
        form.reset();
        modal.classList.add('hidden'); 
        carregarEstoque(user); 
    } catch (error) {
        alert("Erro ao salvar! Verifique sua conexão.");
        console.error(error);
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.innerText = "SALVAR NO ESTOQUE";
    }
});

// --- 6. DELETAR ITEM ---
window.deletarItem = async (id) => {
    if (confirm("Deseja realmente remover este insumo do sistema?")) {
        try {
            await deleteDoc(doc(db, "estoque", id));
            carregarEstoque(auth.currentUser); 
        } catch (error) {
            alert("Erro ao excluir.");
        }
    }
};

// --- 7. MONITORAR AUTENTICAÇÃO ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        carregarPreferencias(user);
        carregarEstoque(user);
    } else {
        window.location.href = "index.html";
    }
});

// --- 8. LOGOUT ---
const realizarSair = async () => {
    if (confirm("Deseja sair do sistema?")) {
        try {
            await signOut(auth);
            window.location.href = "index.html";
        } catch (error) {
            console.error(error);
        }
    }
};

document.getElementById('btnSairDesktop')?.addEventListener('click', realizarSair);