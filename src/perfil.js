import { db, auth, storage } from './firebase-config.js';
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { signOut, onAuthStateChanged, EmailAuthProvider, linkWithCredential, GoogleAuthProvider, reauthenticateWithPopup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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

// Referências para Segurança
const btnVincularSenha = document.getElementById('btnVincularSenha');
const novaSenhaAcesso = document.getElementById('novaSenhaAcesso');

let urlFotoFinal = "";
let urlCapaFinal = ""; 
let emailUsuarioLogado = ""; 

// --- FUNÇÃO: APLICAR TEMA DINÂMICO ---
function aplicarCor(cor) {
    if (!cor) return;
    document.documentElement.style.setProperty('--cor-primaria', cor);
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

    emailUsuarioLogado = user.email || user.providerData?.[0]?.email || "";
    processarLink(user.uid);

    try {
        const docRef = doc(db, "usuarios", user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const d = docSnap.data();
            
            if (!emailUsuarioLogado && d.email) {
                emailUsuarioLogado = d.email;
            }

            document.getElementById('nomeNegocio').value = d.nomeNegocio || "";
            document.getElementById('whatsappNegocio').value = d.whatsapp || "";
            
            // Carregar Configurações de Entrega
            if (d.configEntrega) {
                tipoEntrega.value = d.configEntrega.tipo || 'fixo';
                taxaFixa.value = d.configEntrega.taxaFixa || "";
                raioMaximo.value = d.configEntrega.raioMaximo || "";
                valorKm.value = d.configEntrega.valorKm || "";
                lojaLat.value = d.configEntrega.coords?.lat || "";
                lojaLog.value = d.configEntrega.coords?.log || "";
                
                if (d.configEntrega.tipo === 'raio') {
                    document.getElementById('btnModoRaio')?.click();
                } else {
                    document.getElementById('btnModoFixo')?.click();
                }

                if (d.configEntrega.coords?.lat) {
                    statusGPS.innerHTML = "✅ Localização Base Fixada";
                }
            }

            // --- CARREGAR HORÁRIOS (Compatível com Accordion) ---
            if (d.horarios) {
                const diasTratar = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
                diasTratar.forEach(dia => {
                    if (d.horarios[dia]) {
                        const inputAbre = document.querySelector(`input[name="abre_${dia}"]`);
                        const inputFecha = document.querySelector(`input[name="fecha_${dia}"]`);
                        const checkStatus = document.querySelector(`input[name="status_${dia}"]`);

                        if (inputAbre) inputAbre.value = d.horarios[dia].abre || "";
                        if (inputFecha) inputFecha.value = d.horarios[dia].fecha || "";
                        if (checkStatus) checkStatus.checked = d.horarios[dia].aberto;
                    }
                });
            }

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
    } catch (err) { console.error("Erro ao carregar perfil:", err); }
});

// --- UPLOADS ---
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
        btnSalvarPerfil.innerText = "Salvar Todas as Configurações";
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
        btnSalvarPerfil.innerText = "Salvar Todas as Configurações";
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

    btnSalvarPerfil.innerText = "⏳ SALVANDO...";
    btnSalvarPerfil.disabled = true;

    try {
        // Capturar cor (mesmo que não esteja explícita no HTML, mantemos a lógica ou pegamos do CSS)
        const corSelecionada = getComputedStyle(document.documentElement).getPropertyValue('--cor-primaria').trim() || "#2563eb";
        
        // --- CAPTURAR HORÁRIOS DA SEMANA ---
        const horarios = {};
        const diasSemana = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
        
        diasSemana.forEach(dia => {
            const inputAbre = document.querySelector(`input[name="abre_${dia}"]`);
            const inputFecha = document.querySelector(`input[name="fecha_${dia}"]`);
            const inputStatus = document.querySelector(`input[name="status_${dia}"]`);

            horarios[dia] = {
                abre: inputAbre ? inputAbre.value : "",
                fecha: inputFecha ? inputFecha.value : "",
                aberto: inputStatus ? inputStatus.checked : false
            };
        });

        const novosDados = {
            nomeNegocio: document.getElementById('nomeNegocio').value.trim(),
            whatsapp: document.getElementById('whatsappNegocio').value.trim(),
            fotoPerfil: urlFotoFinal,
            fotoCapa: urlCapaFinal,
            corTema: corSelecionada,
            horarios: horarios, 
            configEntrega: {
                tipo: tipoEntrega.value,
                taxaFixa: parseFloat(taxaFixa.value) || 0,
                raioMaximo: parseFloat(raioMaximo.value) || 0,
                valorKm: parseFloat(valorKm.value) || 0,
                coords: { lat: lojaLat.value, log: lojaLog.value }
            },
            userId: user.uid,
            email: user.email || emailUsuarioLogado || "", 
            ultimaAtualizacao: new Date().toISOString()
        };

        await setDoc(doc(db, "usuarios", user.uid), novosDados, { merge: true });

        Swal.fire({
            icon: 'success',
            title: 'Perfil Atualizado!',
            text: 'Suas informações, incluindo horários, foram salvas.',
            confirmButtonColor: corSelecionada
        });
        
    } catch (err) {
        console.error(err);
        Swal.fire('Erro', 'Ocorreu um erro ao salvar os dados.', 'error');
    } finally {
        btnSalvarPerfil.innerText = "Salvar Todas as Configurações";
        btnSalvarPerfil.disabled = false;
    }
});

// --- VINCULAR E-MAIL E SENHA ---
btnVincularSenha?.addEventListener('click', async () => {
    const user = auth.currentUser;
    const senha = novaSenhaAcesso.value;
    
    let emailFinal = user?.email || 
                     user?.providerData?.find(p => p.email)?.email || 
                     emailUsuarioLogado;

    if (!emailFinal && user) {
        try {
            const snap = await getDoc(doc(db, "usuarios", user.uid));
            if (snap.exists()) emailFinal = snap.data().email;
        } catch (e) { console.error("Falha no resgate de e-mail:", e); }
    }

    if (!emailFinal) {
        return Swal.fire({
            icon: 'error',
            title: 'Identificação Pendente',
            text: 'Por favor, salve as configurações no fim da página primeiro.',
        });
    }

    if (!senha || senha.length < 6) {
        return Swal.fire('Atenção', 'A senha deve ter pelo menos 6 caracteres.', 'warning');
    }

    try {
        Swal.fire({ title: 'Vinculando...', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });
        const credential = EmailAuthProvider.credential(emailFinal, senha);
        await linkWithCredential(user, credential);
        
        Swal.fire({
            icon: 'success',
            title: 'Senha Definida!',
            text: `Agora você pode logar com seu e-mail: ${emailFinal}`,
            confirmButtonColor: '#2563eb'
        });
        novaSenhaAcesso.value = "";

    } catch (err) {
        if (err.code === 'auth/requires-recent-login') {
            const provider = new GoogleAuthProvider();
            await reauthenticateWithPopup(user, provider);
            const cred = EmailAuthProvider.credential(emailFinal, senha);
            await linkWithCredential(user, cred);
            Swal.fire('Sucesso!', 'Senha definida!', 'success');
        } else {
            Swal.fire('Erro', `Falha: ${err.code}`, 'error');
        }
    }
});

// --- AUXILIARES ---
document.getElementById('btnCopiarLink')?.addEventListener('click', () => {
    if(inputLink && inputLink.value) {
        navigator.clipboard.writeText(inputLink.value);
        Swal.fire({ icon: 'success', title: 'Copiado!', timer: 1500, showConfirmButton: false });
    }
});

document.getElementById('btnCapturarGps')?.addEventListener('click', () => {
    statusGPS.innerHTML = "⏳ Localizando...";
    navigator.geolocation.getCurrentPosition((pos) => {
        lojaLat.value = pos.coords.latitude;
        lojaLog.value = pos.coords.longitude;
        statusGPS.innerHTML = "✅ Localização Base Fixada";
    }, (err) => {
        statusGPS.innerHTML = "❌ Erro ao localizar";
        Swal.fire('Erro', 'Ative o GPS do seu dispositivo.', 'error');
    });
});

const sair = async () => {
    const result = await Swal.fire({
        title: 'Sair?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sair'
    });
    if (result.isConfirmed) {
        signOut(auth).then(() => window.location.href="index.html");
    }
};

document.getElementById('btnSairDesktop')?.addEventListener('click', sair);
