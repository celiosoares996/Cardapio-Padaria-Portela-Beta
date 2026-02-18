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

// --- 1. TEMA E NOME DO NEGÓCIO ---
async function carregarPreferencias(user) {
    if (!user) return;
    try {
        const docRef = doc(db, "usuarios", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const dados = docSnap.data();
            const nomeNegocio = dados.nomeNegocio || "Estoque";
            if (document.getElementById('navNomeNegocio')) document.getElementById('navNomeNegocio').innerText = nomeNegocio;
            if (document.getElementById('sideNomeNegocio')) document.getElementById('sideNomeNegocio').innerText = nomeNegocio;
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
if (btnFechar) btnFechar.onclick = () => modal.classList.add('hidden');

// --- 3. CARREGAR LISTA ---
async function carregarEstoque(user) {
    if (!user) return;
    try {
        const q = query(collection(db, "estoque"), where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        lista.innerHTML = ""; 
        if (querySnapshot.empty) {
            lista.innerHTML = `<tr><td colspan="3" class="p-20 text-center"><p class="text-slate-400">Estoque vazio.</p></td></tr>`;
            return;
        }
        querySnapshot.forEach((documento) => {
            const data = documento.data();
            const id = documento.id;
            let iconType = 'package';
            if(['kg', 'gr'].includes(data.unidade)) iconType = 'wheat';
            if(['lt', 'ml'].includes(data.unidade)) iconType = 'droplets';

            lista.innerHTML += `
                <tr class="flex flex-col md:table-row p-4 border-b">
                    <td class="md:p-6 font-bold">${data.nome}</td>
                    <td class="md:p-6 text-blue-600 font-black">${data.quantidade} ${data.unidade}</td>
                    <td class="md:p-6 flex gap-2">
                        <button onclick="prepararEdicao('${id}', '${data.nome}', ${data.quantidade}, '${data.unidade}')" class="text-slate-400 hover:text-blue-600"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                        <button onclick="deletarItem('${id}')" class="text-slate-400 hover:text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </td>
                </tr>`;
        });
        if(window.lucide) lucide.createIcons();
    } catch (e) { console.error("Erro ao carregar:", e); }
}

// --- 4. SALVAR/ATUALIZAR ---
form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return alert("Usuário não logado!");

    const id = editIdInput.value;
    const dados = {
        nome: document.getElementById('nomeItem').value.trim(),
        quantidade: parseInt(document.getElementById('quantidadeItem').value) || 0,
        unidade: document.getElementById('unidadeItem').value,
        userId: user.uid, // DEVE SER EXATAMENTE IGUAL À REGRA
        ultimaAtualizacao: serverTimestamp()
    };

    try {
        if (id) {
            await updateDoc(doc(db, "estoque", id), dados);
        } else {
            dados.dataCriacao = serverTimestamp();
            await addDoc(collection(db, "estoque"), dados);
        }
        form.reset();
        modal.classList.add('hidden');
        await carregarEstoque(user);
    } catch (error) {
        console.error("ERRO FIREBASE:", error.code, error.message);
        alert("Erro de permissão! Tente excluir itens antigos no console do Firebase.");
    }
});

// --- 5. GLOBAIS ---
window.prepararEdicao = (id, nome, qtd, unid) => {
    editIdInput.value = id;
    document.getElementById('nomeItem').value = nome;
    document.getElementById('quantidadeItem').value = qtd;
    document.getElementById('unidadeItem').value = unid;
    modalTitulo.innerText = "Atualizar Insumo";
    modal.classList.remove('hidden');
};

window.deletarItem = async (id) => {
    if(confirm("Deseja remover?")) {
        await deleteDoc(doc(db, "estoque", id));
        await carregarEstoque(auth.currentUser);
    }
};

// --- 6. AUTH ---
onAuthStateChanged(auth, (user) => {
    if (user) { carregarPreferencias(user); carregarEstoque(user); }
    else { window.location.href = "index.html"; }
});
