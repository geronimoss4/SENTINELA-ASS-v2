const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();

app.use(express.json());
app.use(cors());

// Health check para o Render
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use(express.static(path.join(__dirname, "../frontend")));

const DB_FILE = path.join(__dirname, "db.json");

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    return {
      usuarios: [],
      pacientes: [],
      triagens: [],
      consultas: [], 
      tv_chamada: null,
      tv_historico: []
    };
  }
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (!db.tv_chamada) db.tv_chamada = null;
  if (!db.tv_historico) db.tv_historico = [];
  return db;
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// LOGIN
app.post("/login", (req, res) => {
  const db = readDB();

  const user = db.usuarios.find(u =>
    u.usuario === req.body.usuario &&
    u.senha === req.body.senha
  );

  if (!user) {
    return res.status(401).json({ erro: "Login inválido" });
  }

  res.json(user);
});

// ATENDIMENTO - cadastrar paciente
app.post("/atendimento", (req, res) => {
  const db = readDB();

  const paciente = {
    id: Date.now(),
    nome: req.body.nome,
    cpf: req.body.cpf,
    tipo: req.body.tipo,
    status: "triagem",
    createdAt: new Date()
  };

  db.pacientes.push(paciente);
  writeDB(db);

  res.json(paciente);
});

// LISTAR PACIENTES (triagem busca quem foi cadastrado no atendimento)
app.get("/pacientes", (req, res) => { 
  const db = readDB();
  res.json(db.pacientes);
});

// TRIAGEM
app.post("/triagem", (req, res) => {
  const db = readDB();

  let risco = req.body.risco;

  if (req.body.temperatura >= 39) {
    risco = "vermelho";
  } else if (req.body.temperatura >= 38) {
    risco = "amarelo";
  } else if (!risco) {
    risco = "verde";
  }

  const triagem = {
    id: Date.now(),
    nome: req.body.nome,
    sintoma: req.body.sintoma,
    temperatura: req.body.temperatura,
    alergia: req.body.alergia,
    observacao: req.body.observacao,
    risco,
    status: "aguardando_medico",
    createdAt: new Date()
  };

  db.triagens.push(triagem);
  writeDB(db);

  res.json(triagem);
});

// LISTAR TRIAGENS
app.get("/triagens", (req, res) => {
  const db = readDB();
  res.json(db.triagens);
});

// DADOS DE UMA TRIAGEM PARA ABRIR A CONSULTA MÉDICA
app.get("/triagem/:id", (req, res) => {
  const db = readDB();
  const triagem = db.triagens.find(t => String(t.id) === String(req.params.id));
  if (!triagem) return res.status(404).json({ erro: "Triagem não encontrada" });

  const paciente = db.pacientes.find(p => p.nome && triagem.nome && p.nome.trim().toLowerCase() === triagem.nome.trim().toLowerCase());
  res.json({
    ...triagem,
    cpf: paciente?.cpf || triagem.cpf || ""
  });
});

// ============ MÍDIA INDOOR - TV ============

// Função criada para enviar a chamada do paciente para a tela da TV.
// Serve para triagem chamar o paciente no guichê e para o médico chamar no consultório.
app.post("/tv/chamar", (req, res) => {
  const db = readDB();

  const chamada = {
    id: Date.now().toString(),
    localTipo: req.body.localTipo,
    localNumero: req.body.localNumero,
    paciente: req.body.paciente,
    hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  };

  db.tv_chamada = chamada;
  db.tv_historico.unshift(chamada);
  if (db.tv_historico.length > 5) db.tv_historico.pop();

  writeDB(db);
  res.json(chamada);
});

// Função criada para consultar a chamada atual e o histórico que será exibido na TV.
// Essa rota é usada para atualizar a tela automaticamente a cada poucos segundos.
app.get("/tv/chamada", (req, res) => {
  const db = readDB();
  res.json({
    chamada: db.tv_chamada,
    historico: db.tv_historico
  });
});

// LISTA DE MEDICAÇÕES
app.get("/lista-medicacoes", (req, res) => {
  res.json([
    "Dipirona",
    "Paracetamol",
    "Ibuprofeno",
    "Amoxicilina",
    "Azitromicina",
    "Loratadina",
    "Omeprazol",
    "Buscopan",
    "Dramin",
    "Soro fisiológico"
  ]);
});

// CONSULTA MÉDICA
app.post("/consulta", (req, res) => {
  const db = readDB();

  if (!req.body.paciente || !req.body.medico || !req.body.dataConsulta) {
    return res.status(400).json({ erro: "Paciente, médico e data da consulta são obrigatórios." });
  }

  const consulta = {
    id: Date.now(),
    triagemId: req.body.triagemId || null,
    paciente: req.body.paciente,
    cpf: req.body.cpf || "",
    dataConsulta: req.body.dataConsulta,
    medico: req.body.medico,
    crm: req.body.crm || "",
    pressao: req.body.pressao || "",
    frequencia: req.body.frequencia || "",
    saturacao: req.body.saturacao || "",
    queixa: req.body.queixa || "",
    historico: req.body.historico || "",
    exame: req.body.exame || "",
    diagnostico: req.body.diagnostico || "",
    medicacao: req.body.medicacao || "",
    posologia: req.body.posologia || "",
    orientacoes: req.body.orientacoes || "",
    retorno: req.body.retorno || "",
    destino: req.body.destino || "Alta médica",
    obs: req.body.obs || "",
    assinatura: Array.isArray(req.body.assinatura) ? req.body.assinatura : [],
    createdAt: new Date()
  };

  db.consultas.push(consulta);

  if (consulta.triagemId) {
    const triagem = db.triagens.find(t => String(t.id) === String(consulta.triagemId));
    if (triagem) triagem.status = consulta.destino === "Alta médica" ? "alta" : "atendido";
  }

  writeDB(db);
  res.json(consulta);
});

// MEDICAÇÕES
app.get("/medicacoes", (req, res) => {
  const db = readDB();
  res.json(db.consultas);
});

// START
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Servidor rodando em http://${HOST}:${PORT}`);
});