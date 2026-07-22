/* ========================================================
   QUEST APP — APP.JS (VK Mini App version)
   Polling: jsonbin.io (не зависит от домена сервера,
   поэтому работает у туристов без VPN)
   ======================================================== */

const ACCESS_PASSWORDS = ["88888888"];

// Состояние квеста читаем из jsonbin.io — не зависит от твоего домена,
// поэтому туристам не нужен VPN, чтобы это увидеть.
const JSONBIN_ID    = "6a611608da38895dfe80e7aa";
const JSONBIN_KEY   = "$2a$10$BGdTf9HzuQ8IaHVTBnp/hevLYS0wmW2BrH/pGI6oFMtv7c.zocgfG";
const JSONBIN_URL   = `https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`;
const POLL_INTERVAL = 2000;
const MAP_CENTER    = [49.1155, 55.7785];
const MAP_ZOOM      = 16;

/* ── ДЕШИФРОВЩИКИ ── */
const CIPHERS = {
    atbash:     { label: "Атбаш",           image: "images/shifrs/atbash.jpeg" },
    brail:      { label: "Брайль",           image: "images/shifrs/brail.jpeg" },
    caesar:     { label: "Цезарь",           image: "images/shifrs/caesar.jpeg" },
    engalph:    { label: "Англ. алфавит",    image: "images/shifrs/engalph.jpeg" },
    klavanouta: { label: "Клавиатура (ПК)",  image: "images/shifrs/klavanouta.jpeg" },
    klavatelef: { label: "Клавиатура (тел)", image: "images/shifrs/klavatelef.jpeg" },
    kvadrat:    { label: "Квадрат Полибия",  image: "images/shifrs/kvadratpolibiya.jpeg" },
    morze:      { label: "Морзе",            image: "images/shifrs/morze.jpeg" },
    pigpen:     { label: "Пигпен",           image: "images/shifrs/pigpen.jpeg" },
    polybiy:    { label: "Полибий",          image: "images/shifrs/polybiy.jpeg" },
    rot13:      { label: "ROT13",            image: "images/shifrs/rot13.jpeg" },
    rusalph:    { label: "Рус. алфавит",     image: "images/shifrs/rusalph.jpeg" },
    ruspolibiy: { label: "Рус. Полибий",     image: "images/shifrs/ruspolibiy.jpeg" },
    tablmend:   { label: "Табл. Менделеева", image: "images/shifrs/tablmend.jpeg" },
};

const ALL_CIPHERS = Object.values(CIPHERS);

/* ── ЗАГАДКИ ── */
const QUESTS = [
    {
        id: 1,
        riddleImage: "images/deshi/1.jpeg",
        ciphers: ALL_CIPHERS,
        answer: "площадь",
        destination: {
            lat: 55.77819113050887, lng: 49.114996341041206,
            hint: "Площадь",
            polygon: [[49.114996341041206,55.77819113050887],[49.115109200961854,55.77806771212528],[49.11530200332612,55.778117961085826],[49.11518914340547,55.77823608996613],[49.114996341041206,55.77819113050887]],
            radius: 30
        }
    },
    {
        id: 2,
        riddleImage: "images/deshi/2.jpeg",
        ciphers: ALL_CIPHERS,
        answer: "сад слёз",
        destination: {
            lat: 55.77793339938111, lng: 49.114370579958404,
            hint: "Сад слёз",
            polygon: [[49.114370579958404,55.77793339938111],[49.11480488763681,55.777484841627825],[49.114970611244274,55.77755258672718],[49.11541025007162,55.77768627201593],[49.11537652788425,55.777722191132],[49.11542811103595,55.77774395336186],[49.1150613106164,55.778126630549394],[49.1149997083362,55.77810701085889],[49.114370579958404,55.77793339938111]],
            radius: 30
        }
    },
    {
        id: 3,
        riddleImage: "images/deshi/3.jpeg",
        ciphers: ALL_CIPHERS,
        answer: "дом шамиля",
        destination: {
            lat: 55.77753686331749, lng: 49.11510408207437,
            hint: "Дом Шамиля",
            polygon: [[49.11510408207437,55.77753686331749],[49.11546113119152,55.77764485536568],[49.115650064205,55.77744647455344],[49.11541178996055,55.77737416671607],[49.115372732161234,55.777416049537266],[49.11525776644686,55.77737887694289],[49.11510408207437,55.77753686331749]],
            radius: 30
        }
    },
    {
        id: 4,
        riddleImage: "images/deshi/4.jpeg",
        ciphers: ALL_CIPHERS,
        answer: "розовый дом",
        destination: {
            lat: 55.7775440400238, lng: 49.11437735070788,
            hint: "Розовый дом",
            polygon: [[49.11437735070788,55.7775440400238],[49.114569453489025,55.77760324086978],[49.1147085620068,55.77745273683598],[49.114521384506986,55.77739464188261],[49.11437735070788,55.7775440400238]],
            radius: 30
        }
    },
    {
        id: 5,
        riddleImage: "images/deshi/5.jpeg",
        ciphers: ALL_CIPHERS,
        answer: "седьмая поликлиника",
        destination: {
            lat: 55.77849196760809, lng: 49.115961143709654,
            hint: "Седьмая поликлиника",
            polygon: [[49.115961143709654,55.77849196760809],[49.117231095489814,55.77885515601059],[49.117115471849445,55.77898160100989],[49.11659085321509,55.778833244208954],[49.116524807075194,55.778903981837686],[49.116401997607625,55.77886906707732],[49.11646430759939,55.77879921570869],[49.11633116726426,55.77876257241482],[49.11630201698458,55.7787950235421],[49.11603241778539,55.77871897282736],[49.11598754419248,55.778769936802746],[49.11576309204514,55.77870720332098],[49.115961143709654,55.77849196760809]],
            radius: 40
        }
    },
    {
        id: 6,
        riddleImage: "images/deshi/6.jpeg",
        ciphers: ALL_CIPHERS,
        answer: "синий дом напротив",
        destination: {
            lat: 55.77833035789749, lng: 49.116154646810855,
            hint: "Синий дом напротив",
            polygon: [[49.116154646810855,55.77833035789749],[49.11634689974906,55.778115738601116],[49.1164648600618,55.77814846547966],[49.11642083616729,55.77819782602887],[49.11647923122848,55.77821395899568],[49.11640148220931,55.778294862557345],[49.11643853932301,55.77830535718252],[49.11636006671975,55.77839082401053],[49.116154646810855,55.77833035789749]],
            radius: 30
        }
    },
    {
        id: 7,
        riddleImage: "images/deshi/7.jpeg",
        ciphers: ALL_CIPHERS,
        answer: "дом каушчи",
        destination: {
            lat: 55.7786341846971, lng: 49.11722348685598,
            hint: "Дом Каушчи",
            polygon: [[49.11722348685598,55.7786341846971],[49.117388987484816,55.77867389139848],[49.117539348057676,55.778478264488456],[49.117247694470166,55.77840684297033],[49.1171867045104,55.77848287207985],[49.11731412342027,55.778513921645185],[49.11722348685598,55.7786341846971]],
            radius: 30
        }
    },
    {
        id: 8,
        riddleImage: "images/deshi/8.jpeg",
        ciphers: ALL_CIPHERS,
        answer: "апанаевская мечеть",
        destination: {
            lat: 55.77783082969208, lng: 49.11911249003285,
            hint: "Апанаевская мечеть",
            polygon: [[49.11911249003285,55.77783082969208],[49.11923690847311,55.777765472839974],[49.11957698620466,55.777959098206],[49.1194489441838,55.77802783879588],[49.11911249003285,55.77783082969208]],
            radius: 30
        }
    },
    {
        id: 9,
        riddleImage: "images/deshi/9.jpeg",
        ciphers: ALL_CIPHERS,
        answer: "озеро кабан",
        destination: {
            lat: 55.78174145618698, lng: 49.11722731740201,
            hint: "Озеро Кабан",
            polygon: [
                [49.11722731740201,  55.78174145618698],
                [49.11871399524344,  55.78052356898351],
                [49.1190643291726,   55.7801244935207],
                [49.11959735166721,  55.77990293132885],
                [49.12017219639216,  55.7793012111249],
                [49.12137899093537,  55.77827586292494],
                [49.1212214766318,   55.77726004894333],
                [49.121351137380344, 55.77597603473319],
                [49.12152587691307,  55.77581585654528],
                [49.12153961510171,  55.77466963145537],
                [49.121891942745634, 55.77371153330242],
                [49.1225663066173,   55.77324843692355],
                [49.12314674640314,  55.77267278383144],
                [49.12306012654929,  55.772411656501276],
                [49.12390414976909,  55.771824068393585],
                [49.124058176059805, 55.771557894348774],
                [49.12457986723203,  55.77108224662334],
                [49.12496564843457,  55.77039220462186],
                [49.12609283059962,  55.76935420076276],
                [49.12671121573371,  55.768613377415335],
                [49.1269201333169,   55.76836887022307],
                [49.127241166090926, 55.76827092995407],
                [49.129318795825924, 55.769027988222206],
                [49.12961640660711,  55.769288787924125],
                [49.12925673777582,  55.76959509916662],
                [49.12919710616663,  55.76972618662029],
                [49.12903624002129,  55.76976717685102],
                [49.128948321360696, 55.76995632606807],
                [49.12806341295919,  55.770412522647916],
                [49.127776736226764, 55.770707318733514],
                [49.127654017825364, 55.77086576096798],
                [49.12765471048712,  55.771057804420366],
                [49.12757222713526,  55.77125440818807],
                [49.127646212426356, 55.771526518001764],
                [49.12780568316521,  55.771677647018294],
                [49.12820121604676,  55.771779315212],
                [49.12826365129462,  55.77193667875744],
                [49.12820946858906,  55.772050160064936],
                [49.12803634072685,  55.77208278651153],
                [49.12790365792773,  55.77216815536403],
                [49.127655149630954, 55.772450694145135],
                [49.12731886583208,  55.77270566934689],
                [49.12707656983298,  55.772735316564734],
                [49.12660199147919,  55.77272736715196],
                [49.12651937104306,  55.77297423899407],
                [49.12641542430984,  55.77302661162855],
                [49.126404298439326, 55.77333057109706],
                [49.12630462418417,  55.77349658274821],
                [49.12633717275273,  55.77367655264018],
                [49.12627904390931,  55.77382118470928],
                [49.12682462851049,  55.77387907866088],
                [49.12695417597041,  55.77398104225907],
                [49.12663626540862,  55.774170427396655],
                [49.12663935793444,  55.7742370478295],
                [49.12678565455499,  55.774635369899585],
                [49.126890903642476, 55.77491589134664],
                [49.1269520496904,   55.775027244557805],
                [49.126965101667366, 55.77512592807605],
                [49.12690329418922,  55.77520635807744],
                [49.126806680053676, 55.77528088361035],
                [49.1265762944752,   55.77541923157048],
                [49.12621738986627,  55.77586655186536],
                [49.126132296052674, 55.7762894080748],
                [49.126168293634436, 55.77649477626247],
                [49.12637414724037,  55.77710772747767],
                [49.12618702146045,  55.77769288181349],
                [49.12632063076839,  55.77792722857305],
                [49.12585708159227,  55.777932885594964],
                [49.1258769244869,   55.77820059024194],
                [49.126323655041745, 55.778206514103715],
                [49.126216119996684, 55.7784850802436],
                [49.12620414663968,  55.77868247354277],
                [49.125683765840165, 55.779113120549766],
                [49.125230895808585, 55.77965457207367],
                [49.12524654977801,  55.77992879834346],
                [49.12480959443866,  55.78033018085631],
                [49.12411850797375,  55.78113756505306],
                [49.12355669365567,  55.78133482524527],
                [49.123109687733006, 55.781271863740045],
                [49.12291576161121,  55.78133960042081],
                [49.122940044142325, 55.78145651425348],
                [49.123150505265016, 55.781555827030616],
                [49.123287498624734, 55.78167666675532],
                [49.12300452547922,  55.782169734156184],
                [49.122165223749676, 55.782687764548456],
                [49.12151181943673,  55.78299380602553],
                [49.121316306532265, 55.78311355574675],
                [49.12131354379383,  55.78318495626871],
                [49.120246526641665, 55.78378693879455],
                [49.12029550869349,  55.78383286688066],
                [49.11967623588009,  55.78416840691108],
                [49.11927093239393,  55.783893349195665],
                [49.11931165534034,  55.78386854871701],
                [49.118623657184656, 55.783348265252215],
                [49.118705761298656, 55.78331367256831],
                [49.118391479250846, 55.78308975493894],
                [49.11844180787679,  55.78306461686776],
                [49.11868481311316,  55.78324243848195],
                [49.11885487072328,  55.783172440715646],
                [49.11821723345838,  55.78269675016176],
                [49.118079779557945, 55.78266817283898],
                [49.11761634255569,  55.782344830138584],
                [49.117863811363264, 55.78224704889408],
                [49.11722731740201,  55.78174145618698],
            ],
            radius: 60
        }
    },
    {
        id: 10,
        riddleImage: "images/deshi/10.jpeg",
        ciphers: ALL_CIPHERS,
        answer: "памятник марджани",
        destination: {
            lat: 55.780347545120605, lng: 49.11865784913121,
            hint: "Памятник Марджани",
            polygon: [[49.11865784913121,55.780347545120605],[49.11868551305221,55.78034707532004],[49.11868729446786,55.780372455732646],[49.11865713865444,55.780372944428336],[49.11865784913121,55.780347545120605]],
            radius: 20
        }
    },
    {
        id: 11,
        riddleImage: "images/deshi/11.jpeg",
        ciphers: ALL_CIPHERS,
        answer: "мечеть",
        destination: {
            lat: 55.77954988161301, lng: 49.117888543561435,
            hint: "Мечеть",
            polygon: [[49.117888543561435,55.77954988161301],[49.11803102261021,55.779490252902804],[49.118256098160714,55.7796664877842],[49.11800365662532,55.779996335555666],[49.11787261101992,55.779966292637965],[49.11783073355471,55.78001436706674],[49.117788870704885,55.77997985511993],[49.117607069453925,55.78005389958804],[49.117558119560954,55.780020937156934],[49.117603941718215,55.780006647254794],[49.1173047211463,55.779784607965865],[49.117454355317335,55.779722307792724],[49.117744765471315,55.77994136934123],[49.117826839799136,55.77990586409658],[49.1177337948659,55.779833819256595],[49.11806400647359,55.77968829182146],[49.117888543561435,55.77954988161301]],
            radius: 30
        }
    },
    {
        id: 12,
        riddleImage: "images/deshi/12.jpeg",
        ciphers: ALL_CIPHERS,
        answer: "исламский колледж",
        destination: {
            lat: 55.780176336376, lng: 49.11682810880731,
            hint: "Исламский колледж",
            polygon: [[49.11682810880731,55.780176336376],[49.1172520725579,55.78024455938578],[49.11718824863783,55.78036476598206],[49.11676720775796,55.78029663923414],[49.11682810880731,55.780176336376]],
            radius: 30
        }
    },
    {
        id: 13,
        riddleImage: "images/deshi/13.jpeg",
        ciphers: ALL_CIPHERS,
        answer: "55.780616, 49.116170",
        destination: {
            lat: 55.7805843720208, lng: 49.116199516591706,
            hint: "Точка на карте",
            polygon: [
                [49.116199516591706, 55.7805843720208],
                [49.11612849809879,  55.78064689552181],
                [49.11621073118596,  55.7806754197598],
                [49.11628198415167,  55.78061383640164],
                [49.116199516591706, 55.7805843720208],
            ],
            radius: 20
        }
    },
    {
        id: 14,
        riddleImage: "images/deshi/14.jpeg",
        ciphers: ALL_CIPHERS,
        answer: "спросите бумажки",
        destination: {
            lat: 55.7805843720208, lng: 49.116199516591706,
            hint: "Спросите бумажки",
            polygon: [
                [49.116199516591706, 55.7805843720208],
                [49.11612849809879,  55.78064689552181],
                [49.11621073118596,  55.7806754197598],
                [49.11628198415167,  55.78061383640164],
                [49.116199516591706, 55.7805843720208],
            ],
            radius: 20
        }
    },
];

/* ── СОСТОЯНИЕ ── */
let map           = null;
let arrowEl       = null;
let lastCoords    = null;
let compassActive = false;
let compassAngle  = 0;
let gpsActive     = false;
let followMode    = true;
let followTimeout = null;
let smoothAngle   = 0;
let currentQuestId = null;
let lastPolledId   = null;
let pollingTimer   = null;
let pulseInterval  = null;
let keyboardView     = "cipher";
let keyboardWasOpen  = false;

/* ── ИНИЦИАЛИЗАЦИЯ ── */
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("passwordInput").addEventListener("keydown", e => {
        if (e.key === "Enter") submitPassword();
    });
    document.getElementById("answerInput").addEventListener("keydown", e => {
        if (e.key === "Enter") submitAnswer();
    });

    if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", () => {
            const riddlePanel    = document.getElementById("riddlePanel");
            const answerBar      = document.getElementById("answerBar");
            const cipherPanel    = document.getElementById("cipherPanel");
            const keyboardToggle = document.getElementById("keyboardToggle");
            const questScreen    = document.getElementById("questScreen");
            if (!riddlePanel) return;
            const vvh = window.visualViewport.height;
            const fullH = window.innerHeight;
            const isKeyboardOpen = vvh < fullH - 80;
            if (isKeyboardOpen) {
                if (!keyboardWasOpen) {
                    keyboardView = "cipher";
                }
                keyboardWasOpen = true;
                if (questScreen) {
                    questScreen.style.height = vvh + "px";
                    questScreen.style.top    = window.visualViewport.offsetTop + "px";
                }
                const abH  = answerBar      ? answerBar.offsetHeight      : 0;
                const ktH  = keyboardToggle ? keyboardToggle.offsetHeight : 0;
                const available = vvh - abH - ktH;
                riddlePanel.style.flex   = "none";
                riddlePanel.style.height = Math.max(120, available) + "px";
                if (keyboardToggle) keyboardToggle.style.display = "flex";
                applyKeyboardView();
            } else {
                keyboardWasOpen = false;
                if (questScreen) {
                    questScreen.style.height = "";
                    questScreen.style.top    = "";
                }
                riddlePanel.style.flex    = "1";
                riddlePanel.style.height  = "";
                riddlePanel.style.display = "";
                if (cipherPanel) {
                    cipherPanel.style.display  = "";
                    cipherPanel.style.flex     = "";
                    cipherPanel.style.height   = "";
                    cipherPanel.style.overflow = "";
                    if (answerBar) {
                        answerBar.parentNode.insertBefore(cipherPanel, answerBar.nextSibling);
                    }
                }
                if (keyboardToggle) keyboardToggle.style.display = "none";
            }
        });
    }
});

function applyKeyboardView() {
    const riddlePanel    = document.getElementById("riddlePanel");
    const cipherPanel    = document.getElementById("cipherPanel");
    const answerBar      = document.getElementById("answerBar");
    const keyboardToggle = document.getElementById("keyboardToggle");
    const btnRiddle      = document.getElementById("toggleRiddle");
    const btnCipher      = document.getElementById("toggleCipher");
    if (keyboardView === "riddle") {
        if (riddlePanel) riddlePanel.style.display = "";
        if (cipherPanel) {
            cipherPanel.style.display = "none";
            if (answerBar) {
                answerBar.parentNode.insertBefore(cipherPanel, answerBar.nextSibling);
            }
        }
        if (btnRiddle) btnRiddle.classList.add("active");
        if (btnCipher) btnCipher.classList.remove("active");
    } else {
        if (riddlePanel) riddlePanel.style.display = "none";
        if (cipherPanel) {
            cipherPanel.style.display  = "";
            cipherPanel.style.flex     = "none";
            cipherPanel.style.height   = riddlePanel ? riddlePanel.style.height : "";
            cipherPanel.style.overflow = "hidden";
            if (keyboardToggle) {
                keyboardToggle.parentNode.insertBefore(cipherPanel, keyboardToggle);
            }
        }
        if (btnRiddle) btnRiddle.classList.remove("active");
        if (btnCipher) btnCipher.classList.add("active");
    }
}

function toggleKeyboardView(view) {
    keyboardView = view;
    applyKeyboardView();
}

function preloadAllImages() {
    const srcs = new Set();
    QUESTS.forEach(q => {
        if (q.riddleImage) srcs.add(q.riddleImage);
        (q.ciphers || []).forEach(c => { if (c.image) srcs.add(c.image); });
    });
    srcs.forEach(src => { const img = new Image(); img.src = src; });
}

/* ── ПАРОЛЬ ── */
function submitPassword() {
    const input = document.getElementById("passwordInput");
    const error = document.getElementById("passwordError");
    const val   = input.value.trim().toLowerCase();

    if (ACCESS_PASSWORDS.map(p => p.toLowerCase()).includes(val)) {
        error.classList.remove("show");
        showScreen("questScreen");
        initMap();
        startPolling();
        preloadAllImages();
    } else {
        error.classList.add("show");
        input.classList.add("shake");
        input.value = "";
        setTimeout(() => {
            input.classList.remove("shake");
            error.classList.remove("show");
        }, 2500);
    }
}

/* ── ЭКРАНЫ ── */
function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
}

function backToQuest() { showScreen("questScreen"); }

/* ── POLLING — свой сервер ── */
function startPolling() {
    pollOnce();
    pollingTimer = setInterval(pollOnce, POLL_INTERVAL);
}

async function pollOnce() {
    try {
        const res = await fetch(JSONBIN_URL, {
            cache: "no-store",
            headers: { "X-Master-Key": JSONBIN_KEY }
        });
        if (!res.ok) return;
        const data = await res.json();
        const id   = Number(data.record.current);
        if (id !== lastPolledId) {
            lastPolledId = id;
            if (id === 0) showWaiting();
            else loadQuest(id);
        }
    } catch (e) {
        console.warn("Poll failed:", e);
    }
}

/* ── ЗАГРУЗКА ЗАГАДКИ ── */
function loadQuest(id) {
    const quest = QUESTS.find(q => q.id === id);
    if (!quest) { showWaiting(); return; }

    currentQuestId = id;

    document.getElementById("riddleWaiting").classList.add("hidden");
    const img = document.getElementById("riddleImage");
    img.classList.remove("hidden");
    img.src = quest.riddleImage;
    document.getElementById("riddleNumber").textContent = `ЗАГАДКА ${quest.id}`;
    img.onclick = () => openCipherOverlay(quest.riddleImage);
    img.style.cursor = "zoom-in";

    buildCipherButtons(quest.ciphers);
    document.getElementById("answerInput").value = "";
    const fb = document.getElementById("answerFeedback");
    fb.textContent = "";
    fb.className   = "answer-feedback";
}

function showWaiting() {
    document.getElementById("riddleImage").classList.add("hidden");
    document.getElementById("riddleWaiting").classList.remove("hidden");
    document.getElementById("riddleNumber").textContent = "";
    document.getElementById("cipherButtons").innerHTML  = "";
    document.getElementById("cipherPreview").innerHTML  = "";
    document.getElementById("cipherEmpty").classList.remove("hidden");
    currentQuestId = null;
}

/* ── ДЕШИФРОВЩИКИ ── */
function buildCipherButtons(ciphers) {
    const panel     = document.getElementById("cipherPanel");
    const container = document.getElementById("cipherButtons");
    const empty     = document.getElementById("cipherEmpty");
    const preview   = document.getElementById("cipherPreview");

    container.innerHTML = "";
    preview.innerHTML   = "";

    if (!ciphers || ciphers.length === 0) { panel.style.display = "none"; return; }

    panel.style.display = "";
    empty.classList.add("hidden");
    preview.innerHTML = `<span class="cipher-preview-placeholder">Выберите дешифровщик</span>`;

    const shuffled = [...ciphers].sort(() => Math.random() - 0.5);
    container.style.cssText = `display:flex;flex-direction:row;flex-wrap:nowrap;overflow-x:auto;gap:8px;padding-bottom:4px;-webkit-overflow-scrolling:touch;scrollbar-width:none;`;

    shuffled.forEach((c, i) => {
        const btn = document.createElement("button");
        btn.className        = "cipher-btn";
        btn.textContent      = c.label;
        btn.style.flexShrink = "0";
        btn.onclick          = () => selectCipher(c, btn, preview);
        container.appendChild(btn);
        if (i === 0) setTimeout(() => btn.click(), 100);
    });
}

function selectCipher(cipher, btn, preview) {
    document.querySelectorAll(".cipher-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    preview.classList.remove("empty");
    preview.innerHTML = `<img class="cipher-preview-img" src="${cipher.image}" alt="${cipher.label}" onclick="openCipherOverlay('${cipher.image}')" />`;
}

function openCipherOverlay(src) {
    document.getElementById("cipherOverlayImg").src = src;
    document.getElementById("cipherOverlay").classList.remove("hidden");
}
function closeCipherOverlay() {
    document.getElementById("cipherOverlay").classList.add("hidden");
}

/* ── ПРОВЕРКА ОТВЕТА ── */
function submitAnswer() {
    if (!currentQuestId) return;
    const quest    = QUESTS.find(q => q.id === currentQuestId);
    const input    = document.getElementById("answerInput");
    const feedback = document.getElementById("answerFeedback");
    if (!quest) return;

    if (normalizeAnswer(input.value) === normalizeAnswer(quest.answer)) {
        feedback.textContent = "";
        feedback.className   = "answer-feedback";
        requestCompassPermission();
        showSuccessAndOpenMap(quest);
    } else {
        feedback.textContent = "Неверно, попробуйте ещё раз";
        feedback.className   = "answer-feedback wrong";
        input.classList.add("shake");
        setTimeout(() => {
            input.classList.remove("shake");
            feedback.textContent = "";
            feedback.className   = "answer-feedback";
        }, 2000);
    }
}

function normalizeAnswer(str) {
    return str.toLowerCase().trim()
        .replace(/ё/g, "е")
        .replace(/[^а-яa-z0-9,. ]/g, "")
        .replace(/\s+/g, " ");
}

/* ── УСПЕХ → КАРТА ── */
function showSuccessAndOpenMap(quest) {
    const overlay = document.getElementById("successOverlay");
    overlay.classList.remove("hidden");
    document.getElementById("successText").textContent = "Открываю карту…";
    setTimeout(() => {
        overlay.classList.add("hidden");
        openMapWithDestination(quest);
    }, 1800);
}

function openMapWithDestination(quest) {
    showScreen("mapScreen");
    gpsActive = true;
    const dest = quest.destination;
    clearDestination();
    document.getElementById("mapHint").textContent = dest.hint || "";
    const idx = QUESTS.findIndex(q => q.id === quest.id) + 1;
    document.getElementById("mapProgress").textContent = `${idx} / ${QUESTS.length}`;
    if (map) {
        clearDestination();
        map.flyTo({ center: [dest.lng, dest.lat], zoom: 18, duration: 1200 });
        map.once("moveend", () => {
            clearDestination();
            if (dest.polygon) addPolygonDestination(dest);
            else addCircleDestination(dest);
        });
    }
}

/* ── ЗОНЫ НА КАРТЕ ── */
function addCircleDestination(dest) {
    if (!map) return;
    const geojson = { type:"FeatureCollection", features:[{ type:"Feature", geometry:{ type:"Point", coordinates:[dest.lng, dest.lat] }, properties:{} }] };
    if (map.getSource("dest-circle")) { map.getSource("dest-circle").setData(geojson); }
    else {
        map.addSource("dest-circle", { type:"geojson", data:geojson });
        map.addLayer({ id:"dest-circle-layer", type:"circle", source:"dest-circle",
            paint:{ "circle-radius":30, "circle-color":"rgba(255,60,60,0.25)", "circle-stroke-color":"#FF3C3C", "circle-stroke-width":2 } });
    }
    function updateRadius() {
        if (!map.getLayer("dest-circle-layer")) return;
        const mpp = 156543.03392 * Math.cos(dest.lat * Math.PI/180) / Math.pow(2, map.getZoom());
        map.setPaintProperty("dest-circle-layer", "circle-radius", (dest.radius||40)/mpp);
    }
    map.on("zoom", updateRadius);
    updateRadius();
    let up = true;
    pulseInterval = setInterval(() => {
        if (!map.getLayer("dest-circle-layer")) return;
        map.setPaintProperty("dest-circle-layer", "circle-color", up ? "rgba(255,60,60,0.45)" : "rgba(255,60,60,0.12)");
        up = !up;
    }, 600);
}

function addPolygonDestination(dest) {
    if (!map) return;
    const geojson = { type:"FeatureCollection", features:[{ type:"Feature", geometry:{ type:"Polygon", coordinates:[dest.polygon] }, properties:{} }] };
    if (map.getSource("dest-polygon")) { map.getSource("dest-polygon").setData(geojson); }
    else {
        map.addSource("dest-polygon", { type:"geojson", data:geojson });
        map.addLayer({ id:"dest-polygon-fill", type:"fill", source:"dest-polygon", paint:{ "fill-color":"rgba(255,60,60,0.25)", "fill-opacity":1 } });
        map.addLayer({ id:"dest-polygon-line", type:"line", source:"dest-polygon", layout:{ "line-join":"round", "line-cap":"round" }, paint:{ "line-color":"#FF3C3C", "line-width":2.5 } });
    }
    let up = true;
    pulseInterval = setInterval(() => {
        if (!map.getLayer("dest-polygon-fill")) return;
        map.setPaintProperty("dest-polygon-fill", "fill-color", up ? "rgba(255,60,60,0.45)" : "rgba(255,60,60,0.1)");
        up = !up;
    }, 600);
}

function clearDestination() {
    if (pulseInterval) { clearInterval(pulseInterval); pulseInterval = null; }
    if (!map) return;
    ["dest-circle-layer","dest-polygon-fill","dest-polygon-line"].forEach(id => {
        try { if (map.getLayer(id)) map.removeLayer(id); } catch(e) {}
    });
    ["dest-circle","dest-polygon"].forEach(id => {
        try { if (map.getSource(id)) map.removeSource(id); } catch(e) {}
    });
}

/* ── КАРТА ── */
function initMap() {
    if (map) return;
    map = new maplibregl.Map({
        container: "map",
        style: { version:8, sources:{ osm:{ type:"raster", tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize:256 } }, layers:[{ id:"osm-base", type:"raster", source:"osm" }] },
        center: MAP_CENTER,
        zoom:   MAP_ZOOM
    });
    map.on("load", () => {
        createArrow();
        map.getCanvas().addEventListener("pointerdown", () => { followMode = false; if (followTimeout) clearTimeout(followTimeout); });
        map.getCanvas().addEventListener("pointerup",   () => { if (followTimeout) clearTimeout(followTimeout); followTimeout = setTimeout(() => followMode = true, 3000); });
        map.on("move", () => { if (lastCoords) updateArrowPosition(lastCoords); });
        startGPS();
    });
}

/* ── КОМПАС ── */
function requestCompassPermission() {
    if (compassActive) return;
    const ua    = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    if (isIOS && typeof DeviceOrientationEvent?.requestPermission === "function") {
        DeviceOrientationEvent.requestPermission().then(state => {
            if (state === "granted") { compassActive = true; window.addEventListener("deviceorientation", handleCompass); }
        }).catch(() => {});
    } else {
        compassActive = true;
        window.addEventListener("deviceorientation", handleCompass);
    }
}

function handleCompass(e) {
    if (!compassActive || !gpsActive) return;
    let heading = null;
    if (e.webkitCompassHeading != null) { heading = e.webkitCompassHeading; }
    else if (e.alpha != null) {
        const r=Math.PI/180, a=e.alpha*r, b=e.beta*r, g=e.gamma*r;
        const sa=Math.sin(a),ca=Math.cos(a),sb=Math.sin(b),sg=Math.sin(g),cg=Math.cos(g);
        heading = ((Math.atan2(sa*sg-ca*sb*cg, ca*sg+sa*sb*cg)*180/Math.PI)+360)%360;
    }
    if (heading == null) return;
    smoothAngle  = (smoothAngle*0.82 + heading*0.18 + 360) % 360;
    compassAngle = smoothAngle;
    const relative = (smoothAngle - (map ? map.getBearing() : 0) + 360) % 360;
    applyArrowRotation(relative);
    if (followMode && lastCoords && map) map.easeTo({ center:[lastCoords[1],lastCoords[0]], bearing:smoothAngle, duration:300 });
}

/* ── GPS ── */
function startGPS() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition(
        pos => { if (gpsActive) moveMarker([pos.coords.latitude, pos.coords.longitude]); },
        err => console.warn("GPS:", err.message),
        { enableHighAccuracy: true }
    );
}

function moveMarker(coords) {
    const prev = lastCoords;
    lastCoords = coords;
    updateArrowPosition(coords);
    if (prev && !compassAngle) applyArrowRotation(calcAngle(prev, coords));
    if (followMode && map) map.easeTo({ center:[coords[1],coords[0]], duration:300 });
}

function updateArrowPosition(coords) {
    if (!map || !arrowEl) return;
    const pt = map.project([coords[1], coords[0]]);
    arrowEl.style.left = pt.x + "px";
    arrowEl.style.top  = pt.y + "px";
    arrowEl.style.visibility = "visible";
}

function applyArrowRotation(angle) {
    if (!arrowEl) return;
    arrowEl.style.transform = `translate(-50%,-50%) rotate(${angle}deg)`;
}

function calcAngle(from, to) {
    return Math.atan2(to[1]-from[1], to[0]-from[0]) * 180/Math.PI;
}

/* ── СТРЕЛКА ── */
function createArrow() {
    arrowEl = document.createElement("div");
    arrowEl.id = "navArrow";
    arrowEl.innerHTML = `<svg viewBox="0 0 48 48" width="40" height="40" xmlns="http://www.w3.org/2000/svg"><polygon points="24,3 42,45 24,36 6,45" fill="currentColor" opacity="0.95"/></svg>`;
    arrowEl.style.cssText = `position:absolute;pointer-events:none;z-index:9999;transform-origin:center center;color:#00ff88;visibility:hidden;left:50%;top:50%;transform:translate(-50%,-50%);will-change:transform;`;
    document.getElementById("map").appendChild(arrowEl);
}
