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
        if(window.lucide) lucide.createIcons();
    };
}

if (btnFechar) {
    btnFechar.onclick = () => modal.classList.add('hidden');
}

// --- 3. BUSCAR ITENS DO ESTOQUE ---
async function carregarEstoque(user) {
    if (!user) return;

    try {
        const q = query(collection(db, "estoque"), where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        
        lista.innerHTML = ""; 

        if (querySnapshot.empty) {
            lista.innerHTML = `
                <tr>
                    <td colspan="3" class="p-20 text-center">
                        <i data-lucide="package-open" class="w-12 h-12 text-slate-300 mx-auto mb-4"></i>
                        <p class="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Estoque vazio. Adicione insumos!</p>
                    </td>
                </tr>`;
            if(window.lucide) lucide.createIcons();
            return;
        }

        querySnapshot.forEach((documento) => {
            const data = documento.data();
            const id = documento.id;
            
            // Lógica de alerta visual
            const isBaixo = data.quantidade <= 2;
            const corQuantidade = isBaixo ? 'text-red-500 bg-red-50' : 'text-blue-600 bg-blue-50';
            const iconBaixo = isBaixo ? '<i data-lucide="alert-triangle" class="w-3 h-3 inline mr-1"></i>' : '';

            // Ícone por tipo de unidade
            let iconUnidade = 'box';
            if (['kg', 'gr'].includes(data.unidade)) iconUnidade = 'utensils';
            if (['lt', 'ml'].includes(data.unidade)) iconUnidade = 'droplet';

            lista.innerHTML += `
                <tr class="flex flex-col md:table-row p-6 md:p-0 bg-white mb-4 md:mb-0 rounded-[2rem] md:rounded-none border border-slate-100 md:border-none shadow-sm md:shadow-none transition-all hover:bg-slate-50/50">
                    <td class="md:p-8 flex justify-between items-center md:table-cell">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400">
                                <i data-lucide="${iconUnidade}" class="w-6 h-6"></i>
                            </div>
                            <div>
                                <p class="font-extrabold text-slate-800 text-lg md:text-base">${data.nome}</p>
                                <p class="md:hidden text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ingrediente</p>
                            </div>
                        </div>
                    </td>
                    <td class="md:p-8 mt-4 md:mt-0 flex justify-between items-center md:table-cell border-t border-slate-50 pt-4 md:pt-0 md:border-none text-right md:text-left">
                        <span class="md:hidden text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Qtd. Atual</span>
                        <span class="${corQuantidade} px-4 py-2 rounded-xl font-black text-lg italic inline-flex items-center">
                            ${iconBaixo} ${data.quantidade} <small class="text-[10px] ml-1 not-italic uppercase opacity-70">${data.unidade || 'un'}</small>
                        </span>
                    </td>
                    <td class="md:p-8 mt-4 md:mt-0 flex justify-center gap-2 md:table-cell border-t border-slate-50 pt-4 md:pt-0 md:border-none">
                        <div class="flex gap-2 w-full md:justify-center">
                            <button onclick="prepararEdicao('${id}', '${data.nome}', ${data.quantidade}, '${data.unidade}')" 
                                class="flex-1 md:flex-none p-4 md:p-3 bg-slate-100 text-slate-500 rounded-xl hover:bg-brand hover:text-white transition-all flex items-center justify-center">
                                <i data-lucide="pencil" class="w-4 h-4 mr-2 md:mr-0"></i>
                                <span class="md:hidden font-bold uppercase text-[10px]">Atualizar</span>
                            </button>
                            <button onclick="deletarItem('${id}')" 
                                class="flex-1 md:flex-none p-4 md:p-3 bg-red-50 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all flex items-center justify-center">
                                <i data-lucide="trash-2" class="w-4 h-4 mr-2 md:mr-0"></i>
                                <span class="md:hidden font-bold uppercase text-[10px]">Remover</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        // RE-INICIALIZA ÍCONES LUCIDE
        if(window.lucide) lucide.createIcons();

    } catch (error) {
        console.error("Erro ao buscar estoque:", error);
    }
}

// --- 4. FUNÇÃO PARA ABRIR EDIÇÃO ---
window.prepararEdicao = (id, nome, quantidade, unidade) => {
    editIdInput.value = id;
    document.getElementById('nomeItem').value = nome;
    document.getElementById('quantidadeItem').value = quantidade;
    document.getElementById('unidadeItem').value = unidade || "un";
    modalTitulo.innerText = "Atualizar Estoque";
    modal.classList.remove('hidden');
    if(window.lucide) lucide.createIcons();
};

// --- 5. SALVAR OU ATUALIZAR ITEM ---
form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const user = auth.currentUser;
    if (!user) return;

    const btnSalvar = form.querySelector('button[type="submit"]');
    const idParaEditar = editIdInput.value;
    
    btnSalvar.disabled = true;
    const originalText = btnSalvar.innerHTML;
    btnSalvar.innerText = "Sincronizando...";

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
        alert("Erro ao salvar!");
        console.error(error);
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = originalText;
    }
});

// --- 6. DELETAR ITEM ---
window.deletarItem = async (id) => {
    const confirmacao = confirm("Deseja realmente remover este insumo?");
    if (confirmacao) {
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
