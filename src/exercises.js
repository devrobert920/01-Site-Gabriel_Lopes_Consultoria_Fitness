import exerciseData from './assets/exercises/exercicios-mais-comuns.json';

function normalizeExerciseName(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const exerciseLibrary = exerciseData.map((exercise, index) => {
  if (typeof exercise.nome !== 'string' || !exercise.nome.trim()) {
    throw new TypeError(`O exercício na posição ${index + 1} precisa ter um nome.`);
  }

  let videoUrl;
  try {
    videoUrl = new URL(exercise.video);
  } catch {
    throw new TypeError(`O vídeo de "${exercise.nome}" precisa ter uma URL válida.`);
  }

  if (videoUrl.protocol !== 'https:') {
    throw new TypeError(`O vídeo de "${exercise.nome}" precisa usar HTTPS.`);
  }

  const id = normalizeExerciseName(exercise.nome);
  if (!id) throw new TypeError(`Não foi possível gerar um identificador para "${exercise.nome}".`);

  return {
    id,
    name: exercise.nome.trim(),
    category: 'Exercícios',
    video: videoUrl.href,
    sets: '3',
    reps: '10-12',
    rest: '60s',
  };
}).sort((first, second) => first.name.localeCompare(second.name, 'pt-BR', { sensitivity: 'base' }));

const exercisesById = new Map(exerciseLibrary.map((exercise) => [exercise.id, exercise]));
const exercisesByName = new Map(exerciseLibrary.map((exercise) => [normalizeExerciseName(exercise.name), exercise]));

if (exercisesById.size !== exerciseLibrary.length) {
  throw new TypeError('O catálogo de vídeos possui nomes que geram identificadores duplicados.');
}

export const exerciseCategories = [...new Set(exerciseLibrary.map((exercise) => exercise.category))];

export function getExercise(idOrName) {
  if (typeof idOrName !== 'string') return undefined;
  return exercisesById.get(idOrName) || exercisesByName.get(normalizeExerciseName(idOrName));
}

export function createWorkoutExercise(exercise = exerciseLibrary[0]) {
  return {
    id: `exercise-${Math.random().toString(36).slice(2, 9)}`,
    exerciseId: exercise.id,
    videoId: exercise.id,
    name: exercise.name,
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

export function createDemoWorkoutPlan(_studentId, name = 'Treino inicial') {
  const exercises = exerciseLibrary.slice(0, 4).map((exercise) => createWorkoutExercise(exercise));
  return {
    name,
    days: [{ id: 'day-demo-a', name: 'Treino A', exercises }],
  };
}
