import { db, auth, storage } from './firebase-config.js';
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// --- REFERÊNCIAS DO DOM ---
const inputLink = document.getElementById('linkCardapio');
const qrcodeDiv = document.getElementById("qrcode");
const qrcodePrintDiv = document.getElementById("qrcodePrint");
const sideNome = document.getElementById('sideNomeNegocio');
const navNome = document.getElementById('navNomeNegocio');
const mobileNome = document.getElementById('mobileNomeNegocio');
const formPerfil = document.getElementById('formPerfil');
const btnSalvarPerfil = document.getElementById('btnSalvarPerfil');

// Novos campos de entrega
const tipoEntrega = document.getElementById('tipoEntrega');
const taxaFixa = document.getElementById('taxaFixa');
const raioMaximo = document.getElementById('raioMaximo');
const valorKm = document.getElementById('valorKm');
const lojaLat = document.getElementById('lojaLat');
const lojaLog = document.getElementById('lojaLog');
const statusGPS = document.getElementById('statusGPS');

let urlFotoFinal = "";
let urlCapaFinal = ""; 

// --- FUNÇÃO: APLICAR TEMA ---
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
        const link = `${window.location.origin}/cardapio.html?id=${uid}`;
        if (inputLink) inputLink.value = link;

        setTimeout(() => {
            if (typeof QRCode !== "undefined" && qrcodeDiv) {
                qrcodeDiv.innerHTML = "";
                new QRCode(qrcodeDiv, { 
                    text: link, 
                    width: 150, 
                    height: 150,
                    colorDark: "#000000",
                    colorLight: "#ffffff"
                });
            }
        }, 1000);
    } catch (e) { console.error("Erro no Link:", e); }
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
            
            // Dados Básicos
            document.getElementById('nomeNegocio').value = d.nomeNegocio || "";
            document.getElementById('whatsappNegocio').value = d.whatsapp || "";
            if (d.horarioAbertura) document.getElementById('horarioAbertura').value = d.horarioAbertura;
            if (d.horarioFechamento) document.getElementById('horarioFechamento').value = d.horarioFechamento;
            
            // Carregar Dados de Entrega
            if (d.configEntrega) {
                tipoEntrega.value = d.configEntrega.tipo || 'fixo';
                taxaFixa.value = d.configEntrega.taxaFixa || "";
                raioMaximo.value = d.configEntrega.raioMaximo || "";
                valorKm.value = d.configEntrega.valorKm || "";
                lojaLat.value = d.configEntrega.coords?.lat || "";
                lojaLog.value = d.configEntrega.coords?.log || "";
                
                // Dispara o clique visual para ajustar os campos no HTML
                if (d.configEntrega.tipo === 'raio') {
                    document.getElementById('btnModoRaio').click();
                } else {
                    document.getElementById('btnModoFixo').click();
                }

                if (d.configEntrega.coords?.lat) {
                    statusGPS.innerText = "✅ LOCALIZAÇÃO SALVA";
                }
            }

            // Atualizar UI
            const titulo = d.nomeNegocio || "Minha Loja";
            if(sideNome) sideNome.innerText = titulo;
            if(mobileNome) mobileNome.innerText = titulo;
            
            if (d.fotoPerfil) {
                urlFotoFinal = d.fotoPerfil;
                atualizarPreviewImagem('perfil', d.fotoPerfil);
            }
            if (d.fotoCapa) {
                urlCapaFinal = d.fotoCapa;
                atualizarPreviewImagem('capa', d.fotoCapa);
            }
            aplicarCor(d.corTema);
        }
    } catch (err) { console.error("Erro ao carregar dados:", err); }
});

// --- UPLOADS (STORAGE) ---
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
        btnSalvarPerfil.innerText = "Salvar Todas as Alterações";
    } catch (err) { alert("Erro ao subir logo."); btnSalvarPerfil.disabled = false; }
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
        btnSalvarPerfil.innerText = "Salvar Todas as Alterações";
    } catch (err) { alert("Erro ao subir capa."); btnSalvarPerfil.disabled = false; }
});

// --- SALVAR PERFIL (FIRESTORE) ---
formPerfil?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if(!user) return;

    btnSalvarPerfil.innerText = "⏳ SALVANDO...";
    btnSalvarPerfil.disabled = true;

    try {
        const cor = document.querySelector('input[name="temaCor"]:checked')?.value || "#2563eb";
        
        const novosDados = {
            nomeNegocio: document.getElementById('nomeNegocio').value.trim(),
            whatsapp: document.getElementById('whatsappNegocio').value.trim(),
            horarioAbertura: document.getElementById('horarioAbertura').value,
            horarioFechamento: document.getElementById('horarioFechamento').value,
            fotoPerfil: urlFotoFinal,
            fotoCapa: urlCapaFinal,
            corTema: cor,
            // NOVO: Estrutura de Logística
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

        alert("✨ Perfil e Configurações de Entrega atualizados!");
        
        if(sideNome) sideNome.innerText = novosDados.nomeNegocio;
        if(mobileNome) mobileNome.innerText = novosDados.nomeNegocio;

    } catch (err) {
        console.error(err);
        alert("Erro ao salvar dados.");
    } finally {
        btnSalvarPerfil.innerText = "Salvar Todas as Alterações";
        btnSalvarPerfil.disabled = false;
    }
});

// --- EVENTOS GERAIS ---
document.querySelectorAll('input[name="temaCor"]').forEach(r => {
    r.addEventListener('change', (e) => aplicarCor(e.target.value));
});

document.getElementById('btnCopiarLink')?.addEventListener('click', () => {
    if(inputLink && inputLink.value.includes('http')) {
        navigator.clipboard.writeText(inputLink.value);
        alert("Link copiado!");
    }
});

const sair = () => {
    if(confirm("Deseja realmente sair?")) {
        signOut(auth).then(() => window.location.href="index.html");
    }
};

document.getElementById('btnSairDesktop')?.addEventListener('click', sair);
document.getElementById('btnSairMobile')?.addEventListener('click', sair);