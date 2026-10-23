const manualImages = import.meta.glob('./assets/exercises/manual-pages/*.{jpeg,jpg,png}', {
  eager: true,
  import: 'default',
  query: '?url',
});

const catalogue = `
# Abdominais
3|Abdominal Bike
3|Abdominal Canivete
2|Abdominal Infra
2|Abdominal Infra no Banco
3|Abdominal Oblíquo
3|Abdominal Supra
4|Abdominal Supra no Banco Declinado
# Pernas e glúteos
4|Afundo com Barra
5|Afundo com Halter
5|Afundo no Smith
6|Agachamento
6|Agachamento Búlgaro
7|Agachamento Hack
7|Agachamento Sumô
8|Cadeira Abdutora
9|Cadeira Adutora
9|Cadeira Extensora
10|Cadeira Flexora
19|Elevação Pélvica com Barra
22|Flexão Nórdica
23|Glúteos na Máquina
23|Glúteos na Polia Baixa
24|Glúteos em Quatro Apoios
24|Good Morning
25|Leg Press 45°
25|Leg Press 90°
26|Levantamento Terra
26|Mesa Flexora
27|Panturrilha em Pé Unilateral com Halter
28|Panturrilha no Leg Press
28|Panturrilha Sentada
29|Panturrilha no Smith
30|Passada com Barra
30|Passada com Halter
31|Ponte
31|Posterior de Coxa com Bola
32|Posterior de Pernas na Máquina
57|Wall Sit
# Peito
10|Cross Over na Polia Alta
11|Cross Over na Polia Baixa
11|Cross Over na Polia Média
12|Crucifixo Declinado
13|Crucifixo Inclinado
13|Crucifixo Inverso com Halteres
13|Crucifixo Inverso no Cross
14|Crucifixo Invertido no Banco 45°
14|Crucifixo Máquina (Fly)
15|Crucifixo Reto
21|Flexão
49|Supino
49|Supino Declinado com Barra
50|Supino Declinado com Halteres
50|Supino Inclinado com Halteres
51|Supino Inclinado com Barra
51|Supino Máquina
52|Supino Reto com Barra
52|Supino Reto com Halteres
58|Voador (Peck Deck)
# Costas
8|Barra Fixa
33|Pulldown
33|Puxada Aberta na Polia
34|Puxada Fechada com Triângulo na Polia
34|Puxada Pulley
35|Puxada Supinada
35|Remada Alta
36|Remada Curva Inclinada 45°
36|Remada Cavalinho
37|Remada Curvada Pronada
37|Remada Curvada Supinada
38|Remada Sentada Aberta
38|Remada Sentada Fechada
38|Remada Sentada com Triângulo
39|Remada Fechada na Máquina
47|Serrote
# Ombros
15|Desenvolvimento com Halteres (Arnold)
16|Desenvolvimento Militar
16|Desenvolvimento no Smith
17|Elevação Frontal
20|Encolhimento de Ombro
18|Elevação Lateral
18|Elevação Lateral no Banco Inclinado
46|Rotação Lateral do Manguito no Cross
58|Voador Invertido
# Bíceps
39|Rosca Alternada com Halter
40|Rosca Concentrada
40|Rosca de Punho
41|Rosca de Punho Invertida
41|Rosca Direta com Barra 45°
42|Rosca Direta com Barra
42|Rosca Direta com Barra W
43|Rosca Direta no Cabo
43|Rosca Inversa com Barra
44|Rosca Inversa no Cross
44|Rosca Martelo
45|Rosca Martelo no Cross
45|Rosca Scott
46|Rosca Scott no Banco 45°
# Tríceps
21|Extensão de Tríceps no Banco Romano
29|Paralelas
53|Tríceps no Banco
54|Tríceps na Barra no Cross
54|Tríceps na Polia
54|Tríceps com Corda
55|Tríceps com Corda no Cross
55|Tríceps Francês no Cross
56|Tríceps Francês com Halter
56|Tríceps Francês Unilateral
57|Tríceps Testa com Barra
57|Tríceps Testa no Cross
# Core e condicionamento
17|Elevação de Joelhos na Barra
19|Elevação de Pernas na Barra
22|Giro Russo
27|Mountain Climber
32|Prancha
48|Ski
48|Ski Unilateral com Halter
53|Suspensão na Barra
`;

function slugify(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function imageForPage(page) {
  const pageNumber = page === 2 ? 8 : page + 4;
  const highResolutionPage = Object.keys(manualImages).find((path) => path.match(new RegExp(`/exercises/manual-pages/${pageNumber}-`)));
  const pageScan = Object.keys(manualImages).find((path) => path.endsWith(`/exercises/manual-pages/${pageNumber}.jpeg`));
  const image = manualImages[highResolutionPage || pageScan];
  if (!image) throw new Error(`Ilustração não encontrada para a página ${pageNumber} do manual.`);
  return image;
}

const rows = catalogue.trim().split('\n');
let category = '';

export const exerciseLibrary = rows.flatMap((row) => {
  if (row.startsWith('# ')) {
    category = row.slice(2);
    return [];
  }
  const [pageText, name] = row.split('|');
  const page = Number(pageText);
  return [{
    id: slugify(name),
    name,
    category,
    page,
    image: imageForPage(page),
    sets: '3',
    reps: '10-12',
    rest: '60s',
  }];
});

if (exerciseLibrary.length !== 117) {
  throw new Error(`O catálogo deve conter 117 exercícios; foram encontrados ${exerciseLibrary.length}.`);
}

export const exerciseCategories = [...new Set(exerciseLibrary.map((exercise) => exercise.category))];

export function getExercise(exerciseId) {
  return exerciseLibrary.find((exercise) => exercise.id === exerciseId);
}

export function createWorkoutExercise(exerciseId = exerciseLibrary[0].id) {
  const exercise = getExercise(exerciseId) || exerciseLibrary[0];
  return {
    id: `${exercise.id}-${Math.random().toString(36).slice(2, 9)}`,
    exerciseId: exercise.id,
    name: exercise.name,
    image: exercise.image,
    sets: exercise.sets,
    reps: exercise.reps,
    rest: exercise.rest,
    notes: '',
  };
}

export function createWorkoutPlan(name = 'Novo treino') {
  return {
    name,
    days: [{ id: `day-${Math.random().toString(36).slice(2, 9)}`, name: 'Treino A', exercises: [] }],
  };
}

const demoExercisesByStudent = {
  1: [
    ['Treino A · Inferiores', ['agachamento-hack', 'cadeira-extensora', 'afundo-com-halter']],
    ['Treino B · Superiores', ['barra-fixa', 'crucifixo-inclinado', 'elevacao-lateral']],
  ],
  2: [
    ['Treino A · Peito e ombros', ['crucifixo-maquina-fly', 'crucifixo-inclinado', 'desenvolvimento-militar']],
    ['Treino B · Pernas', ['agachamento-hack', 'agachamento-bulgaro', 'cadeira-extensora']],
  ],
  3: [
    ['Treino A · Funcional', ['abdominal-bike', 'afundo-com-halter', 'abdominal-infra-no-banco']],
  ],
};

export function createDemoWorkoutPlan(studentId, name) {
  const days = demoExercisesByStudent[studentId];
  if (!days) return createWorkoutPlan(name);
  return {
    name,
    days: days.map(([dayName, exerciseIds], dayIndex) => ({
      id: `${studentId}-day-${dayIndex + 1}`,
      name: dayName,
      exercises: exerciseIds.map((exerciseId) => createWorkoutExercise(exerciseId)),
    })),
  };
}
