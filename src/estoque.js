import { db, auth } from './firebase-config.js';
import { 
    collection, addDoc, getDocs, query, where, deleteDoc, doc, getDoc, updateDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const form = document.getElementById('formEstoque');
const lista = document.getElementById('listaEstoque');
const modal = document.getElementById('modal');
const btnAbrir = document.getElementById('abrirModal');
const btnFechar = document.getElementById('fecharModal');
const modalTitulo = document.getElementById('modalTitulo');
const editIdInput = document.getElementById('editId');

// --- 1. TEMA E NOME DO NEGÓCIO ---
async function carregarPreferencias(user) {
    if (!user) return;
    try {
        const docRef = doc(db, "usuarios", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const dados = docSnap.data();
            const nomeNegocio = dados.nomeNegocio || "Digitaliza Menu";
            
            // Atualiza os elementos de nome se existirem
            document.querySelectorAll('#navNomeNegocio, #sideNomeNegocio').forEach(el => {
                el.innerText = nomeNegocio;
            });
            
            document.documentElement.style.setProperty('--cor-primaria', dados.corTema || "#2563eb");
        }
    } catch (error) { console.error("Erro preferências:", error); }
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

// Fechar modal ao clicar fora (UX Improvement)
window.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
});

// --- 3. CARREGAR LISTA (DESIGN GRID) ---
async function carregarEstoque(user) {
    if (!user) return;
    try {
        const q = query(collection(db, "estoque"), where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        lista.innerHTML = ""; 

        if (querySnapshot.empty) {
            lista.innerHTML = `
                <div class="p-10 text-center bg-white rounded-[3rem] border border-dashed border-slate-200">
                    <p class="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Nenhum insumo cadastrado.</p>
                </div>`;
            return;
        }

        querySnapshot.forEach((documento) => {
            const data = documento.data();
            const id = documento.id;
            
            // Lógica de ícones por unidade
            let iconType = 'package';
            const unit = data.unidade.toLowerCase();
            if(['kg', 'gr', 'g'].includes(unit)) iconType = 'wheat';
            if(['lt', 'ml', 'l'].includes(unit)) iconType = 'droplets';

            lista.innerHTML += `
                <div class="grid grid-cols-1 md:grid-cols-[1fr_200px_120px] items-center bg-white p-5 md:px-8 md:py-4 rounded-2xl md:rounded-[2.5rem] border border-slate-100 hover:border-brand/30 transition-all gap-4 md:gap-0 shadow-sm item-card">
                    
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400">
                            <i data-lucide="${iconType}" class="w-6 h-6"></i>
                        </div>
                        <div class="flex flex-col">
                            <span class="font-bold text-slate-800 text-lg md:text-base leading-tight">${data.nome}</span>
                            <span class="text-[10px] text-slate-400 font-black uppercase tracking-tighter">Insumo</span>
                        </div>
                    </div>

                    <div class="flex flex-col md:items-center">
                        <span class="md:hidden text-[10px] font-black text-slate-300 uppercase mb-1">Saldo Atual</span>
                        <div class="bg-blue-50 text-brand px-5 py-2 rounded-2xl font-black italic w-fit md:w-auto md:min-w-[110px] text-center">
                            ${data.quantidade} <small class="not-italic opacity-60 uppercase text-[9px]">${data.unidade}</small>
                        </div>
                    </div>

                    <div class="flex justify-end gap-2 border-t md:border-none pt-3 md:pt-0">
                        <button onclick="window.prepararEdicao('${id}', '${data.nome}', ${data.quantidade}, '${data.unidade}')" 
                                class="p-3 text-slate-300 hover:text-brand hover:bg-blue-50 rounded-2xl transition-all">
                            <i data-lucide="pencil" class="w-5 h-5"></i>
                        </button>
                        <button onclick="window.deletarItem('${id}')" 
                                class="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all">
                            <i data-lucide="trash-2" class="w-5 h-5"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        if(window.lucide) lucide.createIcons();
        
    } catch (e) { 
        console.error("Erro ao carregar estoque:", e); 
    }
}

// --- 4. SALVAR/ATUALIZAR ---
form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const id = editIdInput.value;
    const nomeInput = document.getElementById('nomeItem').value.trim();
    const qtdInput = parseInt(document.getElementById('quantidadeItem').value);
    const unidInput = document.getElementById('unidadeItem').value;

    const dados = {
        nome: nomeInput,
        quantidade: qtdInput,
        unidade: unidInput,
        userId: user.uid,
        ultimaAtualizacao: serverTimestamp()
    };

    try {
        // Feedback visual de carregamento no botão
        const btnSubmit = e.target.querySelector('button[type="submit"]');
        const originalText = btnSubmit.innerHTML;
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = "Processando...";

        if (id) {
            await updateDoc(doc(db, "estoque", id), dados);
            Swal.fire({ icon: 'success', title: 'Sucesso!', text: 'Insumo atualizado.', confirmButtonColor: '#2563eb', customClass: { popup: 'rounded-[2.5rem]' } });
        } else {
            dados.dataCriacao = serverTimestamp();
            await addDoc(collection(db, "estoque"), dados);
            Swal.fire({ icon: 'success', title: 'Cadastrado!', text: 'Item adicionado ao estoque.', confirmButtonColor: '#2563eb', customClass: { popup: 'rounded-[2.5rem]' } });
        }

        form.reset();
        modal.classList.add('hidden');
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = originalText;
        
        await carregarEstoque(user);

    } catch (error) {
        console.error(error);
        Swal.fire({ icon: 'error', title: 'Ops!', text: 'Erro ao salvar alterações.', confirmButtonColor: '#ef4444' });
    }
});

// --- 5. FUNÇÕES GLOBAIS ---
window.prepararEdicao = (id, nome, qtd, unid) => {
    editIdInput.value = id;
    document.getElementById('nomeItem').value = nome;
    document.getElementById('quantidadeItem').value = qtd;
    document.getElementById('unidadeItem').value = unid;
    modalTitulo.innerText = "Editar Insumo";
    modal.classList.remove('hidden');
    if(window.lucide) lucide.createIcons();
};

window.deletarItem = async (id) => {
    const result = await Swal.fire({
        title: 'Remover insumo?',
        text: "O saldo deste item será excluído permanentemente.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Sim, remover',
        cancelButtonText: 'Cancelar',
        reverseButtons: true,
        customClass: { popup: 'rounded-[2.5rem]' }
    });

    if (result.isConfirmed) {
        try {
            await deleteDoc(doc(db, "estoque", id));
            await carregarEstoque(auth.currentUser);
            Swal.fire({ title: 'Removido!', icon: 'success', confirmButtonColor: '#2563eb', customClass: { popup: 'rounded-[2.5rem]' } });
        } catch (error) {
            Swal.fire('Erro!', 'Não foi possível excluir.', 'error');
        }
    }
};

// --- 6. AUTH & REDIRECIONAMENTO ---
onAuthStateChanged(auth, (user) => {
    if (user) { 
        carregarPreferencias(user); 
        carregarEstoque(user); 
    } else { 
        window.location.href = "index.html"; 
    }
});

// Logout
document.querySelectorAll('#btnSairDesktop, #btnSairMobile').forEach(btn => {
    btn?.addEventListener('click', async () => {
        const res = await Swal.fire({
            title: 'Deseja sair?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#2563eb',
            confirmButtonText: 'Sair agora',
            cancelButtonText: 'Ficar',
            customClass: { popup: 'rounded-[2.5rem]' }
        });
        if (res.isConfirmed) {
            await signOut(auth);
            window.location.href = "index.html";
        }
    });
});
