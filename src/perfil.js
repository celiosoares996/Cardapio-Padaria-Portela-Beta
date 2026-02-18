import { db, auth, storage } from './firebase-config.js';
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// --- REFERÊNCIAS DO DOM ---
const inputLink = document.getElementById('linkCardapio');
const qrcodePrintDiv = document.getElementById("qrcodePrint");
const sideNome = document.getElementById('sideNomeNegocio');
const mobileNome = document.getElementById('mobileNomeNegocio');
const formPerfil = document.getElementById('formPerfil');
const btnSalvarPerfil = document.getElementById('btnSalvarPerfil');

// Campos de entrega e logística
const tipoEntrega = document.getElementById('tipoEntrega');
const taxaFixa = document.getElementById('taxaFixa');
const raioMaximo = document.getElementById('raioMaximo');
const valorKm = document.getElementById('valorKm');
const lojaLat = document.getElementById('lojaLat');
const lojaLog = document.getElementById('lojaLog');
const statusGPS = document.getElementById('statusGPS');

let urlFotoFinal = "";
let urlCapaFinal = ""; 

// --- FUNÇÃO: APLICAR TEMA DINÂMICO ---
function aplicarCor(cor) {
    if (!cor) return;
    document.documentElement.style.setProperty('--cor-primaria', cor);
    const radio = document.querySelector(`input[name="temaCor"][value="${cor}"]`);
    if (radio) radio.checked = true;
}

// --- FUNÇÃO: EXIBIR IMAGENS (PREVIEW) ---
function atualizarPreviewImagem(tipo, url) {
    if (tipo === 'perfil') {
        const img = document.getElementById('imgLogo');
        const placeholder = document.getElementById('placeholderEmoji');
        if (img && url) {
            img.src = url;
            img.classList.remove('hidden');
            if (placeholder) placeholder.classList.add('hidden');
        }
    } else if (tipo === 'capa') {
        const imgCapa = document.getElementById('imgCapa');
        const placeholderCapa = document.getElementById('placeholderCapa');
        if (imgCapa && url) {
            imgCapa.src = url;
            imgCapa.classList.remove('hidden');
            if (placeholderCapa) placeholderCapa.classList.add('hidden');
        }
    }
}

// --- FUNÇÃO: GERAR LINK E QR CODE ---
function processarLink(uid) {
    try {
        // Altere 'seusite.com' para a URL real onde o projeto estiver hospedado
        const link = `${window.location.origin}/cardapio.html?id=${uid}`;
        if (inputLink) inputLink.value = link;

        setTimeout(() => {
            if (typeof QRCode !== "undefined" && qrcodePrintDiv) {
                qrcodePrintDiv.innerHTML = "";
                new QRCode(qrcodePrintDiv, { 
                    text: link, 
                    width: 250, 
                    height: 250,
                    colorDark: "#000000",
                    colorLight: "#ffffff"
                });
            }
        }, 1000);
    } catch (e) { console.error("Erro ao gerar QR Code:", e); }
}

// --- ESCUTAR ESTADO DO USUÁRIO ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    processarLink(user.uid);

    try {
        const docSnap = await getDoc(doc(db, "usuarios", user.uid));
        if (docSnap.exists()) {
            const d = docSnap.data();
            
            // Preencher Campos de Texto
            document.getElementById('nomeNegocio').value = d.nomeNegocio || "";
            document.getElementById('whatsappNegocio').value = d.whatsapp || "";
            if (d.horarioAbertura) document.getElementById('horarioAbertura').value = d.horarioAbertura;
            if (d.horarioFechamento) document.getElementById('horarioFechamento').value = d.horarioFechamento;
            
            // Configurações de Entrega
            if (d.configEntrega) {
                tipoEntrega.value = d.configEntrega.tipo || 'fixo';
                taxaFixa.value = d.configEntrega.taxaFixa || "";
                raioMaximo.value = d.configEntrega.raioMaximo || "";
                valorKm.value = d.configEntrega.valorKm || "";
                lojaLat.value = d.configEntrega.coords?.lat || "";
                lojaLog.value = d.configEntrega.coords?.log || "";
                
                // Ativar visualmente o botão correto de frete
                if (d.configEntrega.tipo === 'raio') {
                    document.getElementById('btnModoRaio').click();
                } else {
                    document.getElementById('btnModoFixo').click();
                }

                if (d.configEntrega.coords?.lat) {
                    statusGPS.innerHTML = "✅ Localização Base Fixada";
                }
            }

            // Atualizar Nomes na Sidebar/Navbar
            const titulo = d.nomeNegocio || "Minha Loja";
            if(sideNome) sideNome.innerText = titulo;
            if(mobileNome) mobileNome.innerText = titulo;
            
            // Imagens
            if (d.fotoPerfil) {
                urlFotoFinal = d.fotoPerfil;
                atualizarPreviewImagem('perfil', d.fotoPerfil);
            }
            if (d.fotoCapa) {
                urlCapaFinal = d.fotoCapa;
                atualizarPreviewImagem('capa', d.fotoCapa);
            }
            aplicarCor(d.corTema);
        } else {
            // Caso o usuário não tenha dados, limpa os labels de carregamento
            if(sideNome) sideNome.innerText = "Configurar Loja";
            if(mobileNome) mobileNome.innerText = "Configurar Loja";
        }
    } catch (err) { console.error("Erro ao carregar perfil:", err); }
});

// --- UPLOADS PARA FIREBASE STORAGE ---
const realizarUpload = async (tipo, file) => {
    const nomeArquivo = `${Date.now()}_${file.name}`;
    const sRef = ref(storage, `${tipo}/${auth.currentUser.uid}/${nomeArquivo}`);
    await uploadBytes(sRef, file);
    return await getDownloadURL(sRef);
};

document.getElementById('fileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !auth.currentUser) return;
    try {
        btnSalvarPerfil.disabled = true;
        btnSalvarPerfil.innerText = "⏳ ENVIANDO LOGO...";
        urlFotoFinal = await realizarUpload('logos', file);
        atualizarPreviewImagem('perfil', urlFotoFinal);
        btnSalvarPerfil.disabled = false;
        btnSalvarPerfil.innerText = "Salvar Alterações";
    } catch (err) { 
        Swal.fire('Erro', 'Não foi possível subir a imagem.', 'error');
        btnSalvarPerfil.disabled = false; 
    }
});

document.getElementById('fileCapa')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !auth.currentUser) return;
    try {
        btnSalvarPerfil.disabled = true;
        btnSalvarPerfil.innerText = "⏳ ENVIANDO CAPA...";
        urlCapaFinal = await realizarUpload('capas', file);
        atualizarPreviewImagem('capa', urlCapaFinal);
        btnSalvarPerfil.disabled = false;
        btnSalvarPerfil.innerText = "Salvar Alterações";
    } catch (err) { 
        Swal.fire('Erro', 'Não foi possível subir a capa.', 'error');
        btnSalvarPerfil.disabled = false; 
    }
});

// --- SALVAR TUDO NO FIRESTORE ---
formPerfil?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if(!user) return;

    btnSalvarPerfil.innerText = "⏳ SALVANDO TUDO...";
    btnSalvarPerfil.disabled = true;

    try {
        const corSelecionada = document.querySelector('input[name="temaCor"]:checked')?.value || "#2563eb";
        
        const novosDados = {
            nomeNegocio: document.getElementById('nomeNegocio').value.trim(),
            whatsapp: document.getElementById('whatsappNegocio').value.trim(),
            horarioAbertura: document.getElementById('horarioAbertura').value,
            horarioFechamento: document.getElementById('horarioFechamento').value,
            fotoPerfil: urlFotoFinal,
            fotoCapa: urlCapaFinal,
            corTema: corSelecionada,
            configEntrega: {
                tipo: tipoEntrega.value,
                taxaFixa: parseFloat(taxaFixa.value) || 0,
                raioMaximo: parseFloat(raioMaximo.value) || 0,
                valorKm: parseFloat(valorKm.value) || 0,
                coords: {
                    lat: lojaLat.value,
                    log: lojaLog.value
                }
            },
            userId: user.uid,
            ultimaAtualizacao: new Date().toISOString()
        };

        await setDoc(doc(db, "usuarios", user.uid), novosDados, { merge: true });

        Swal.fire({
            icon: 'success',
            title: 'Perfil Atualizado!',
            text: 'Suas informações foram salvas com sucesso.',
            confirmButtonColor: corSelecionada
        });
        
        if(sideNome) sideNome.innerText = novosDados.nomeNegocio;
        if(mobileNome) mobileNome.innerText = novosDados.nomeNegocio;

    } catch (err) {
        console.error(err);
        Swal.fire('Erro', 'Ocorreu um erro ao salvar os dados.', 'error');
    } finally {
        btnSalvarPerfil.innerText = "Salvar Alterações";
        btnSalvarPerfil.disabled = false;
    }
});

// --- MUDANÇA DE COR EM TEMPO REAL ---
document.querySelectorAll('input[name="temaCor"]').forEach(r => {
    r.addEventListener('change', (e) => aplicarCor(e.target.value));
});

// --- FUNÇÃO SAIR ---
const sair = async () => {
    const result = await Swal.fire({
        title: 'Sair do Sistema?',
        text: "Você precisará fazer login novamente.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sim, sair!',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        signOut(auth).then(() => window.location.href="index.html");
    }
};

document.getElementById('btnSairDesktop')?.addEventListener('click', sair);
document.getElementById('btnSairMobile')?.addEventListener('click', sair);
