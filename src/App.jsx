import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { createDemoWorkoutPlan, createWorkoutExercise, createWorkoutPlan, exerciseCategories, exerciseLibrary, getExercise } from './exercises.js';
import { getSupabaseClient, isSupabaseConfigured } from './supabase.js';
import brandLogo from './assets/brand/gabriel-lopes-logo.png';

const navigation = [
  { id: 'overview', label: 'Visão geral', icon: 'grid' },
  { id: 'students', label: 'Meus alunos', icon: 'users' },
  { id: 'workouts', label: 'Treinos', icon: 'dumbbell' },
  { id: 'nutrition', label: 'Planos alimentares', icon: 'leaf' },
  { id: 'progress', label: 'Evolução', icon: 'chart' },
];

function Icon({ name, size = 18 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    dumbbell: <><path d="m6.5 6.5 11 11M4 9l5-5M15 20l5-5M2 11l9-9M13 22l9-9" /></>,
    leaf: <><path d="M20 4c-8 0-14 4-14 11a5 5 0 0 0 5 5c7 0 11-6 9-16Z" /><path d="M4 20c3-4 7-7 12-10" /></>,
    chart: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-5 5" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    check: <><path d="m5 12 4 4L19 6" /></>,
    share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.7 10.7 6.6-4.4m-6.6 7 6.6 4.4" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function normalizeStudent(student) {
  const legacyExerciseIds = { 'afundo-halter': 'afundo-com-halter', 'crucifixo-maquina': 'crucifixo-maquina-fly' };
  const workoutPlan = student.workoutPlan || createDemoWorkoutPlan(student.id, student.workout || 'Novo treino');
  return normalizeStudentRecords({
    ...student,
    workoutPlan: {
      ...workoutPlan,
      days: (workoutPlan.days || []).map((day) => ({
        ...day,
        exercises: (day.exercises || []).map((exercise) => {
          const exerciseId = legacyExerciseIds[exercise.exerciseId] || exercise.exerciseId;
          const canonical = getExercise(exerciseId);
          const imageExercise = exercise.imageId === 'none' ? null : getExercise(exercise.imageId) || canonical;
          return {
            ...exercise,
            exerciseId: canonical ? canonical.id : 'custom',
            name: canonical ? canonical.name : exercise.name || '',
            imageId: exercise.imageId ?? imageExercise?.id ?? (exercise.image ? 'custom' : 'none'),
            image: exercise.imageId === 'none' ? '' : imageExercise?.image || exercise.image || '',
          };
        }),
      })),
    },
  });
}

function readLegacyStudents() {
  const saved = localStorage.getItem('gl-consultoria-students');
  if (!saved) return [];
  const students = JSON.parse(saved);
  if (!Array.isArray(students)) throw new TypeError('Os dados locais não são uma lista válida de alunos.');
  return students.map(normalizeStudent);
}

function pendingSyncKey(ownerId) {
  return `gl-consultoria-pending-sync-${ownerId}`;
}

function readPendingSyncStudents(ownerId) {
  const saved = localStorage.getItem(pendingSyncKey(ownerId));
  if (!saved) return [];
  const pending = JSON.parse(saved);
  if (!Array.isArray(pending)) throw new TypeError('A fila de sincronização local está inválida.');
  return pending.map(normalizeStudent);
}

function storePendingSyncStudents(records, ownerId) {
  let pending = [];
  try {
    pending = readPendingSyncStudents(ownerId);
  } catch (error) {
    console.error('Não foi possível ler a fila de sincronização anterior.', error);
  }
  const byId = new Map(pending.map((student) => [String(student.id), student]));
  records.forEach((student) => byId.set(String(student.id), student));
  localStorage.setItem(pendingSyncKey(ownerId), JSON.stringify([...byId.values()]));
}

function clearPendingSyncStudents(records, ownerId) {
  const synced = new Map(records.map((student) => [String(student.id), JSON.stringify(student)]));
  try {
    const pending = readPendingSyncStudents(ownerId);
    const remaining = pending.filter((student) => synced.get(String(student.id)) !== JSON.stringify(student));
    if (remaining.length) localStorage.setItem(pendingSyncKey(ownerId), JSON.stringify(remaining));
    else localStorage.removeItem(pendingSyncKey(ownerId));
  } catch (error) {
    console.error('Não foi possível atualizar a fila de sincronização local.', error);
  }
}

function initials(name) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function formatDate(date) {
  if (!date) return '—';
  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function todayDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function createDietPlan(name = 'Plano alimentar') {
  return {
    name,
    meals: [],
  };
}

function normalizeDietMeal(meal, index) {
  const legacyNames = String(meal.foods || '').split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
  const foods = Array.isArray(meal.foods)
    ? [...meal.foods]
    : legacyNames.map((name, foodIndex) => ({
      id: `${meal.id || `meal-${index}`}-food-${foodIndex}`,
      name,
      quantity: foodIndex === 0 ? String(meal.portion || '') : '',
    }));
  if (!foods.length && meal.portion) foods.push({
    id: `${meal.id || `meal-${index}`}-food-0`,
    name: '',
    quantity: String(meal.portion),
  });
  const mealId = meal.id || `meal-${index}`;
  return {
    ...meal,
    id: mealId,
    foods: foods.map((food, foodIndex) => {
      const item = typeof food === 'string' ? { name: food } : food;
      return {
        id: item.id || `${mealId}-food-${foodIndex}`,
        name: item.name == null ? '' : String(item.name),
        quantity: item.quantity == null ? '' : String(item.quantity),
      };
    }),
  };
}

function normalizeStudentRecords(student) {
  const today = todayDate();
  const weightRecords = student.weightRecords?.length
    ? student.weightRecords
    : (student.history?.length ? student.history : [Number(student.weight)]).map((value, index, values) => {
      const date = new Date(`${today}T12:00:00`);
      date.setMonth(date.getMonth() - (values.length - index - 1));
      return { date: date.toISOString().slice(0, 10), value: Number(value) };
    });
  const measurementRecords = student.measurementRecords?.length
    ? student.measurementRecords
    : [{ date: student.startDate || today, ...(student.measurements || {}) }];
  return {
    ...student,
    history: weightRecords.map((record) => Number(record.value)),
    weightRecords,
    measurementRecords,
    dietPlan: student.dietPlan
      ? { ...student.dietPlan, meals: Array.isArray(student.dietPlan.meals) ? student.dietPlan.meals.map(normalizeDietMeal) : [] }
      : createDietPlan(student.diet?.startsWith('Nenhum') ? 'Plano alimentar' : student.diet || 'Plano alimentar'),
  };
}

const shareStudentKey = (id) => `gl-shared-student-${id}`;

function createLiveShareToken() {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Seu navegador não consegue gerar um token seguro. Use HTTPS ou um navegador atualizado.');
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return `live.${uuid}`;
}

function studentShareData(student) {
  return {
    id: student.id,
    name: student.name,
    goal: student.goal,
    weight: student.weight,
    height: student.height,
    startDate: student.startDate,
    measurements: student.measurements,
    weightRecords: student.weightRecords,
    measurementRecords: student.measurementRecords,
    workoutPlan: {
      name: student.workoutPlan?.name || student.workout,
      days: (student.workoutPlan?.days || []).map((day) => ({
        id: day.id,
        name: day.name,
        exercises: day.exercises.map(({ id, exerciseId, imageId, image, name, sets, reps, rest, notes }) => ({ id, exerciseId, imageId, image, name, sets, reps, rest, notes })),
      })),
    },
    dietPlan: {
      name: student.dietPlan?.name || student.diet,
      meals: (student.dietPlan?.meals || []).map((meal) => ({
        id: meal.id,
        time: meal.time,
        name: meal.name,
        notes: meal.notes,
        foods: meal.foods.map(({ id, name, quantity }) => ({ id, name, quantity })),
      })),
    },
  };
}

async function encodeShareToken(student) {
  const payload = JSON.stringify({ version: 1, student: studentShareData(student) });
  const rawBytes = new TextEncoder().encode(payload);
  const bytes = typeof CompressionStream === 'undefined'
    ? rawBytes
    : new Uint8Array(await new Response(new Blob([rawBytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  const token = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return typeof CompressionStream === 'undefined' ? token : `z1.${token}`;
}

async function decodeShareToken(token) {
  const compressed = token.startsWith('z1.');
  const encoded = compressed ? token.slice(3) : token;
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const json = compressed
    ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : new TextDecoder().decode(bytes);
  const payload = JSON.parse(json);
  if (payload.version !== 1 || !payload.student?.id || typeof payload.student.name !== 'string') {
    throw new TypeError('O link de compartilhamento não contém um perfil válido.');
  }
  return payload.student;
}

async function readStudentPortalState() {
  const token = window.location.hash.match(/^#student=(.+)$/)?.[1];
  const standalone = new URLSearchParams(window.location.search).get('student-pwa') === '1';
  if (!token && !standalone) return { active: false, student: null, error: '' };
  try {
    const standaloneToken = standalone ? localStorage.getItem('gl-last-shared-student') : null;
    const liveToken = token?.startsWith('live.')
      ? token
      : standaloneToken?.startsWith('live.')
        ? standaloneToken
        : null;
    let student;
    if (liveToken) {
      try {
        const client = await getSupabaseClient();
        if (!client) throw new Error('O compartilhamento atualizado não está configurado neste site.');
        const { data, error } = await client.rpc('get_shared_student', {
          share_token_input: liveToken.slice('live.'.length),
        });
        if (error) throw error;
        if (!data?.id || typeof data.name !== 'string') {
          throw new TypeError('Este link não está mais disponível. Solicite um novo link ao consultor.');
        }
        student = { ...data, shareToken: liveToken };
      } catch (error) {
        const cached = standalone || token ? localStorage.getItem(shareStudentKey(liveToken)) : null;
        if (!cached) throw error;
        console.warn('Não foi possível atualizar o painel compartilhado; exibindo a última versão salva neste aparelho.', error);
        student = JSON.parse(cached);
      }
      localStorage.setItem(shareStudentKey(liveToken), JSON.stringify(student));
      localStorage.setItem('gl-last-shared-student', liveToken);
    } else {
      student = token
        ? await decodeShareToken(token)
        : JSON.parse(localStorage.getItem(shareStudentKey(standaloneToken)) || 'null');
    }
    if (!student?.id || typeof student.name !== 'string') throw new TypeError('Este aparelho ainda não tem um perfil compartilhado salvo.');
    return { active: true, student, error: '' };
  } catch (error) {
    console.error('Não foi possível abrir o perfil compartilhado.', error);
    return { active: true, student: null, error: error.message || 'Não foi possível abrir este perfil.' };
  }
}

function buildStudentShareUrl(student) {
  if (!student.shareToken) throw new TypeError('Gere ou atualize o link de compartilhamento antes de continuar.');
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = `student=${student.shareToken}`;
  return url.toString();
}

export default function App() {
  const [portalState, setPortalState] = useState(() => ({
    active: Boolean(window.location.hash.match(/^#student=(.+)$/) || new URLSearchParams(window.location.search).get('student-pwa') === '1'),
    student: null,
    error: '',
  }));
  const [supabaseClient, setSupabaseClient] = useState(null);
  const [authState, setAuthState] = useState({ loading: isSupabaseConfigured, user: null });
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [studentsError, setStudentsError] = useState('');
  const [legacyImportAvailable, setLegacyImportAvailable] = useState(false);
  const [legacyImportCount, setLegacyImportCount] = useState(0);
  const [legacyStudents, setLegacyStudents] = useState([]);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [activePage, setActivePage] = useState('overview');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const cloudWriteQueue = useRef(Promise.resolve());
  const shareTokensByStudent = useRef(new Map());

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthState({ loading: false, user: null });
      return undefined;
    }
    let active = true;
    let subscription;
    getSupabaseClient().then(async (client) => {
      if (!active) return;
      if (!client) throw new Error('O cliente do Supabase não foi configurado.');
      setSupabaseClient(client);
      const { data: { subscription: authSubscription } } = client.auth.onAuthStateChange((_event, session) => {
        if (!active) return;
        const user = session?.user || null;
        setAuthState({ loading: false, user });
        if (!user) {
          setStudents([]);
          setStudentsLoaded(false);
          setLegacyImportAvailable(false);
        }
      });
      subscription = authSubscription;
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (active) setAuthState({ loading: false, user: data.session?.user || null });
    }).catch((error) => {
      if (!active) return;
      console.error('Não foi possível iniciar a conexão com o Supabase.', error);
      setAuthState({ loading: false, user: null, error: 'Não foi possível conectar ao Supabase. Confira as variáveis de ambiente.' });
    });
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabaseClient || !authState.user) return undefined;
    let active = true;
    setStudentsLoading(true);
    setStudentsLoaded(false);
    setStudentsError('');
    async function loadCloudStudents() {
      const { data, error } = await supabaseClient
        .from('student_records')
        .select('student_id,payload')
        .eq('owner_id', authState.user.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const cloudStudents = data.map(({ payload }) => normalizeStudent(payload));
      let pendingStudents = [];
      try {
        pendingStudents = readPendingSyncStudents(authState.user.id);
      } catch (pendingError) {
        console.error('Não foi possível ler alterações pendentes deste dispositivo.', pendingError);
        setNotice('A fila de alterações locais está ilegível. Não apague os dados deste navegador; confira a configuração.');
      }
      if (pendingStudents.length) {
        try {
          await persistStudents(pendingStudents);
          clearPendingSyncStudents(pendingStudents, authState.user.id);
        } catch (pendingError) {
          console.error('Não foi possível reenviar alterações pendentes para o Supabase.', pendingError);
          setNotice('Há alterações deste dispositivo que ainda não foram salvas na nuvem. O sistema tentará novamente.');
        }
      }
      const allStudentsById = new Map(cloudStudents.map((student) => [String(student.id), student]));
      pendingStudents.forEach((student) => allStudentsById.set(String(student.id), student));
      const availableStudents = [...allStudentsById.values()];
      let localStudents = [];
      if (cloudStudents.length === 0) {
        try {
          localStudents = readLegacyStudents();
        } catch (localError) {
          console.error('Não foi possível ler os dados locais para migração.', localError);
          setNotice('Não foi possível ler os dados locais para importação. Eles não foram alterados.');
        }
      }
      if (!active) return;
      setStudents(availableStudents);
      setLegacyImportAvailable(cloudStudents.length === 0 && localStudents.length > 0);
      setLegacyImportCount(localStudents.length);
      setLegacyStudents(localStudents);
      setStudentsLoaded(true);
      setStudentsLoading(false);
    }
    loadCloudStudents().catch((error) => {
      if (!active) return;
      console.error('Não foi possível carregar os alunos do Supabase.', error);
      setStudentsError('Não foi possível carregar os alunos da nuvem. Verifique a configuração do banco e tente novamente.');
      setStudentsLoading(false);
    });
    return () => { active = false; };
  }, [authState.user, loadAttempt, supabaseClient]);

  useEffect(() => {
    if (!portalState.student) return;
    const cacheKey = portalState.student.shareToken || String(portalState.student.id);
    localStorage.setItem(shareStudentKey(cacheKey), JSON.stringify(portalState.student));
    localStorage.setItem('gl-last-shared-student', cacheKey);
    document.title = `${portalState.student.name} | Gabriel Lopes Fitness`;
  }, [portalState.student]);

  useEffect(() => {
    let cancelled = false;
    const syncPortalFromUrl = async () => {
      const state = await readStudentPortalState();
      if (!cancelled) setPortalState(state);
    };
    syncPortalFromUrl();
    window.addEventListener('hashchange', syncPortalFromUrl);
    window.addEventListener('popstate', syncPortalFromUrl);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', syncPortalFromUrl);
      window.removeEventListener('popstate', syncPortalFromUrl);
    };
  }, []);

  useEffect(() => {
    if (!authState.user || !studentsLoaded) return;
    localStorage.setItem('gl-consultoria-students-cloud-cache', JSON.stringify(students));
  }, [authState.user, students, studentsLoaded]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const filteredStudents = useMemo(
    () => students.filter((student) => `${student.name} ${student.goal}`.toLowerCase().includes(search.toLowerCase())),
    [students, search],
  );
  const activeStudents = students.filter((student) => student.status === 'Ativo').length;

  async function persistStudents(records) {
    if (!supabaseClient || !authState.user) throw new Error('A sessão do painel expirou. Entre novamente para salvar.');
    const rows = records.map((student) => ({
      owner_id: authState.user.id,
      student_id: String(student.id),
      payload: student,
    }));
    const write = cloudWriteQueue.current.then(async () => {
      const { error } = await supabaseClient.from('student_records').upsert(rows, { onConflict: 'owner_id,student_id' });
      if (error) throw error;
      const sharedRows = records.filter((student) => student.shareToken?.startsWith('live.')).map((student) => ({
        share_token: student.shareToken.slice('live.'.length),
        owner_id: authState.user.id,
        student_id: String(student.id),
        payload: studentShareData(student),
      }));
      if (sharedRows.length) {
        const { error: shareError } = await supabaseClient
          .from('student_shared_portals')
          .upsert(sharedRows, { onConflict: 'owner_id,student_id' });
        if (shareError) throw shareError;
      }
    });
    cloudWriteQueue.current = write.catch(() => {});
    return write;
  }

  async function saveStudent(student, successMessage = 'Alterações salvas na nuvem.') {
    try {
      await persistStudents([student]);
      clearPendingSyncStudents([student], authState.user.id);
      setNotice(successMessage);
    } catch (error) {
      console.error('Não foi possível salvar o aluno no Supabase.', error);
      try {
        storePendingSyncStudents([student], authState.user.id);
      } catch (storageError) {
        console.error('Não foi possível guardar a alteração pendente neste dispositivo.', storageError);
      }
      setNotice('Não foi possível salvar na nuvem. A alteração foi mantida neste dispositivo e será reenviada no próximo acesso.');
    }
  }

  async function ensureStudentShare(student) {
    const studentKey = String(student.id);
    const currentStudent = students.find((item) => String(item.id) === studentKey) || student;
    const shareableStudent = {
      ...currentStudent,
      shareToken: currentStudent.shareToken || shareTokensByStudent.current.get(studentKey) || createLiveShareToken(),
    };
    shareTokensByStudent.current.set(studentKey, shareableStudent.shareToken);
    try {
      await persistStudents([shareableStudent]);
      clearPendingSyncStudents([shareableStudent], authState.user.id);
      setStudents((current) => current.map((item) => String(item.id) === String(student.id) ? shareableStudent : item));
      setSelectedStudent((current) => current?.id === student.id ? shareableStudent : current);
      return shareableStudent;
    } catch (error) {
      console.error('Não foi possível atualizar o painel compartilhado do aluno.', error);
      try {
        storePendingSyncStudents([shareableStudent], authState.user.id);
      } catch (storageError) {
        console.error('Não foi possível guardar a atualização pendente do painel compartilhado.', storageError);
      }
      setNotice('Não foi possível atualizar o link na nuvem. Confira a configuração do Supabase e tente novamente.');
      throw new Error('O link não foi atualizado. Verifique a conexão e a instalação do Supabase antes de compartilhar.');
    }
  }

  function addStudent(formData) {
    const student = {
      ...formData,
      id: Date.now(),
      status: 'Ativo',
      lastCheckin: 'Agora',
      measurements: { chest: 0, waist: 0, hip: 0, arm: 0 },
      history: [Number(formData.weight)],
      weightRecords: [{ date: todayDate(), value: Number(formData.weight) }],
      measurementRecords: [],
      workout: 'Nenhum treino cadastrado',
      workoutPlan: createWorkoutPlan(),
      diet: 'Nenhum plano cadastrado',
      dietPlan: createDietPlan(),
    };
    setStudents((current) => [student, ...current]);
    setModalOpen(false);
    setNotice('Aluno cadastrado. Salvando na nuvem...');
    setSelectedStudent(student);
    void saveStudent(student, 'Aluno cadastrado e salvo na nuvem.');
  }

  function updateStudent(id, updates) {
    const currentStudent = students.find((student) => String(student.id) === String(id));
    if (!currentStudent) {
      setNotice('Não foi possível localizar o aluno para salvar as alterações.');
      return;
    }
    const updatedStudent = { ...currentStudent, ...updates };
    setStudents((current) => current.map((student) => String(student.id) === String(id) ? updatedStudent : student));
    setSelectedStudent((current) => current?.id === id ? updatedStudent : current);
    void saveStudent(updatedStudent);
  }

  async function importLocalStudents() {
    try {
      const localStudents = legacyStudents;
      if (!localStudents.length) {
        setLegacyImportAvailable(false);
        setNotice('Não há registros locais para importar.');
        return;
      }
      const studentsById = new Map(students.map((student) => [String(student.id), student]));
      localStudents.forEach((student) => studentsById.set(String(student.id), student));
      const combinedStudents = [...studentsById.values()];
      await persistStudents(combinedStudents);
      clearPendingSyncStudents(combinedStudents, authState.user.id);
      setStudents(combinedStudents);
      setLegacyImportAvailable(false);
      setLegacyStudents([]);
      setNotice(`${localStudents.length} alunos importados e salvos na nuvem.`);
    } catch (error) {
      console.error('Não foi possível importar os alunos locais para o Supabase.', error);
      setNotice('A importação falhou. Os dados locais foram mantidos; tente novamente.');
    }
  }

  async function signOut() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      console.error('Não foi possível encerrar a sessão do painel.', error);
      setNotice('Não foi possível encerrar a sessão. Tente novamente.');
    }
  }

  async function signIn(email, password) {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function shareStudent(student) {
    try {
      const shareableStudent = await ensureStudentShare(student);
      const url = buildStudentShareUrl(shareableStudent);
      const shareData = { title: `Meu acompanhamento — ${student.name}`, text: 'Este link dá acesso aos dados pessoais do acompanhamento e mostra a versão atualizada. Compartilhe apenas diretamente com o aluno.', url };
      if (navigator.share) await navigator.share(shareData);
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareData.url);
        setNotice('Link copiado. Ele não tem senha: compartilhe somente com o aluno.');
      } else {
        throw new Error('Este navegador não permite copiar ou compartilhar o link automaticamente.');
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('Não foi possível compartilhar o perfil do aluno.', error);
      setNotice(error.message || 'Falha ao compartilhar o link do aluno.');
    }
  }

  function pageTitle() {
    if (selectedStudent) return selectedStudent.name;
    return navigation.find((item) => item.id === activePage)?.label || 'Visão geral';
  }

  return (
    portalState.active
      ? portalState.student
        ? <StudentPortal student={portalState.student} />
      : portalState.error
        ? <StudentPortalError message={portalState.error} />
        : <main className="student-portal-error"><p>Carregando painel do aluno...</p></main>
      : !isSupabaseConfigured
        ? <SupabaseSetupPage />
        : authState.loading
          ? <CloudLoadingPage message="Verificando acesso seguro..." />
          : !authState.user
            ? <OwnerLoginPage onSignIn={signIn} initialError={authState.error} />
            : studentsError
              ? <CloudDataErrorPage message={studentsError} onRetry={() => setLoadAttempt((attempt) => attempt + 1)} onSignOut={signOut} />
              : studentsLoading || !studentsLoaded
                ? <CloudLoadingPage message="Carregando alunos salvos na nuvem..." />
                : <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setActivePage('overview'); setSelectedStudent(null); }}>
          <img className="brand-logo" src={brandLogo} alt="" />
          <span className="brand-copy"><strong>GABRIEL LOPES</strong><small>CONSULTORIA FITNESS</small></span>
        </a>
        <div className="workspace-label">MENU PRINCIPAL</div>
        <nav className="nav-list" aria-label="Menu principal">
          {navigation.map((item) => (
            <button className={`nav-item ${!selectedStudent && activePage === item.id ? 'selected' : ''}`} key={item.id} onClick={() => { setActivePage(item.id); setSelectedStudent(null); }}>
              <Icon name={item.icon} /><span>{item.label}</span>{item.id === 'students' && <span className="nav-count">{students.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <div className="tip-icon"><Icon name="chart" size={17} /></div>
            <strong>Consistência gera resultado.</strong>
            <p>Acompanhe de perto a jornada de cada aluno.</p>
            <button onClick={() => { setActivePage('progress'); setSelectedStudent(null); }}>Ver evolução <Icon name="arrow" size={14} /></button>
          </div>
          <div className="profile-mini">
            <div className="avatar avatar-dark">GL</div>
            <div className="profile-copy"><strong>Gabriel Lopes</strong><small>Personal trainer</small></div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><Icon name="chevron" size={14} /><strong>{pageTitle()}</strong></div>
          <div className="topbar-actions">
            <span className="today-label">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <button className="icon-button notification-button" aria-label="Notificações" onClick={() => setNotice('Você está em dia com as notificações.')}><Icon name="bell" /><i /></button>
            <div className="avatar avatar-green">GL</div>
            <button className="outline-button sign-out-button" onClick={signOut}>Sair</button>
          </div>
        </header>

        <div className="page-content">
          {legacyImportAvailable && <LocalImportBanner count={legacyImportCount} onImport={importLocalStudents} onDismiss={() => setLegacyImportAvailable(false)} />}
          {selectedStudent ? (
            <StudentDetail student={selectedStudent} onBack={() => setSelectedStudent(null)} onUpdate={updateStudent} onShare={shareStudent} onEnsureShare={ensureStudentShare} />
          ) : activePage === 'overview' ? (
            <Overview students={students} activeCount={activeStudents} onAdd={() => setModalOpen(true)} onOpen={setSelectedStudent} onPage={setActivePage} />
          ) : activePage === 'students' ? (
            <StudentsPage students={filteredStudents} search={search} onSearch={setSearch} onAdd={() => setModalOpen(true)} onOpen={setSelectedStudent} />
          ) : activePage === 'workouts' ? (
            <AssignmentsPage type="workout" students={students} onOpen={setSelectedStudent} onUpdate={updateStudent} />
          ) : activePage === 'nutrition' ? (
            <AssignmentsPage type="nutrition" students={students} onOpen={setSelectedStudent} onUpdate={updateStudent} />
          ) : (
            <ProgressPage students={students} onOpen={setSelectedStudent} />
          )}
        </div>
      </main>

      {modalOpen && <AddStudentModal onClose={() => setModalOpen(false)} onSave={addStudent} />}
      {notice && <div className="toast"><span className="toast-check"><Icon name="check" size={15} /></span>{notice}</div>}
    </div>
  );
}

function SupabaseSetupPage() {
  return <main className="cloud-gate-page"><section className="cloud-gate-card">
    <img src={brandLogo} alt="" />
    <div className="eyebrow">CONFIGURAÇÃO DO PAINEL</div>
    <h1>Conecte o banco de dados</h1>
    <p>O painel administrativo está bloqueado até que o Supabase seja configurado. Assim, os dados dos alunos não ficam expostos nem são salvos apenas neste navegador.</p>
    <ol><li>Crie um projeto Supabase e execute <code>supabase/schema.sql</code>.</li><li>Cadastre o usuário do Gabriel e desative novos cadastros públicos.</li><li>Configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> na Vercel.</li></ol>
    <p className="cloud-gate-hint">Consulte o guia de publicação na raiz do projeto e depois faça um novo deploy.</p>
  </section></main>;
}

function CloudLoadingPage({ message }) {
  return <main className="cloud-gate-page"><section className="cloud-gate-card cloud-loading"><img src={brandLogo} alt="" /><p>{message}</p></section></main>;
}

function OwnerLoginPage({ onSignIn, initialError }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError || '');
  const [loading, setLoading] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onSignIn(email.trim(), password);
    } catch (signInError) {
      console.error('Não foi possível autenticar no painel.', signInError);
      setError('E-mail ou senha inválidos, ou não foi possível conectar. Confira os dados e tente novamente.');
    } finally {
      setLoading(false);
    }
  }
  return <main className="cloud-gate-page"><section className="cloud-gate-card owner-login-card">
    <img src={brandLogo} alt="" />
    <div className="eyebrow">GABRIEL LOPES · CONSULTORIA FITNESS</div>
    <h1>Acessar painel</h1>
    <p>Entre com a conta privada do consultor para acessar os cadastros salvos na nuvem.</p>
    <form onSubmit={submit}>
      <label className="form-field">E-mail<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="form-field">Senha<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
    </form>
    <small>O acesso é criado pelo administrador do Supabase. Não há cadastro público.</small>
  </section></main>;
}

function CloudDataErrorPage({ message, onRetry, onSignOut }) {
  return <main className="cloud-gate-page"><section className="cloud-gate-card">
    <img src={brandLogo} alt="" />
    <div className="eyebrow">DADOS NA NUVEM</div>
    <h1>Não foi possível carregar os registros</h1>
    <p>{message}</p>
    <div className="cloud-gate-actions"><button className="primary-button" onClick={onRetry}>Tentar novamente</button><button className="outline-button" onClick={onSignOut}>Sair</button></div>
  </section></main>;
}

function LocalImportBanner({ count, onImport, onDismiss }) {
  return <aside className="local-import-banner" aria-label="Importação de dados locais">
    <div><strong>Encontramos {count} {count === 1 ? 'cadastro local' : 'cadastros locais'} neste dispositivo.</strong><p>Importe agora para salvar os registros e o progresso no Supabase.</p></div>
    <div><button className="primary-button" onClick={onImport}>Importar para a nuvem</button><button className="outline-button compact" onClick={onDismiss}>Agora não</button></div>
  </aside>;
}

function StudentPortal({ student }) {
  const [activeTab, setActiveTab] = useState('progress');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
  useEffect(() => {
    const captureInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', captureInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  async function installApp() {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
      setInstallPrompt(null);
    } catch (error) {
      console.error('Não foi possível iniciar a instalação do aplicativo.', error);
    }
  }
  const tabs = [
    ['progress', 'Evolução'],
    ['workout', 'Treinos'],
    ['diet', 'Plano alimentar'],
  ];
  return <div className="student-portal">
    <header className="student-portal-header"><a href="#" className="student-portal-brand" onClick={(event) => event.preventDefault()}><img src={brandLogo} alt="Gabriel Lopes Consultoria Fitness" /><span><strong>GABRIEL LOPES</strong><small>CONSULTORIA FITNESS</small></span></a>{installPrompt ? <button className="primary-button portal-install-button" onClick={installApp}><Icon name="download" size={16} /> Instalar aplicativo</button> : installed ? <span className="portal-installed"><Icon name="check" size={15} /> Aplicativo instalado</span> : <span className="portal-install-hint">Para instalar, use o menu do navegador</span>}</header>
    <main className="student-portal-main">
      <div className="student-portal-welcome"><div className="eyebrow">SEU ACOMPANHAMENTO</div><h1>Olá, {student.name.split(' ')[0]}</h1><p>Treinos, alimentação e evolução em um só lugar.</p></div>
      <nav className="student-portal-tabs" aria-label="Seu painel">{tabs.map(([id, label]) => <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}>{label}</button>)}</nav>
      {activeTab === 'workout' && <WorkoutPlanView plan={student.workoutPlan || createWorkoutPlan()} readOnly />}
      {activeTab === 'diet' && <DietPlanView plan={student.dietPlan || createDietPlan()} />}
      {activeTab === 'progress' && <div className="student-portal-progress">
        <section className="panel portal-progress-panel"><div className="panel-heading"><div><h2>Evolução do peso</h2><p>Seu histórico de acompanhamento.</p></div></div><ProgressChart records={student.weightRecords || []} kind="weight" interactive={false} /></section>
        <section className="panel portal-progress-panel"><div className="panel-heading"><div><h2>Medidas corporais</h2><p>Acompanhe suas avaliações ao longo do tempo.</p></div></div><ProgressChart records={student.measurementRecords || []} kind="measurements" interactive={false} /></section>
      </div>}
      <footer className="student-portal-footer">Acompanhamento personalizado · Gabriel Lopes Consultoria Fitness</footer>
    </main>
  </div>;
}

function ShareQrModal({ student, onClose, onEnsureShare }) {
  const [shareUrl, setShareUrl] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function generateQrCode() {
      try {
        const shareableStudent = await onEnsureShare(student);
        const url = buildStudentShareUrl(shareableStudent);
        const image = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 320 });
        if (!cancelled) {
          setShareUrl(url);
          setQrCode(image);
        }
      } catch (generationError) {
        console.error('Não foi possível gerar o QR Code do perfil.', generationError);
        if (!cancelled) setError('Não foi possível gerar o QR Code. Tente novamente ou compartilhe o link.');
      }
    }
    generateQrCode();
    return () => { cancelled = true; };
  }, [student]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch (copyError) {
      console.error('Não foi possível copiar o link do perfil.', copyError);
      setError('Não foi possível copiar o link automaticamente. Selecione e copie o endereço exibido.');
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card share-qr-modal" role="dialog" aria-modal="true" aria-labelledby="share-qr-title">
    <div className="modal-heading">    <div><div className="eyebrow">COMPARTILHAR COM O ALUNO</div><h2 id="share-qr-title">QR Code de {student.name}</h2><p>Escaneie para abrir a versão atual do treino, dieta e evolução.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button></div>
    {qrCode ? <img className="share-qr-image" src={qrCode} alt={`QR Code do painel de ${student.name}`} /> : <div className="share-qr-placeholder">{error || 'Gerando QR Code...'}</div>}
    <label className="form-field share-qr-link">Link do painel<input readOnly value={shareUrl} onFocus={(event) => event.target.select()} /></label>
    {error && qrCode && <p className="form-error">{error}</p>}
    <div className="modal-footer share-qr-actions"><button type="button" className="outline-button" onClick={onClose}>Fechar</button>{qrCode && <a className="outline-button" href={qrCode} download={`qr-${student.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`}>Baixar QR Code</a>}<button type="button" className="primary-button" onClick={copyLink} disabled={!shareUrl}>{copied ? 'Link copiado' : 'Copiar link'}</button></div>
  </section></div>;
}

function StudentPortalError({ message }) {
  return <main className="student-portal-error"><div className="eyebrow">GABRIEL LOPES CONSULTORIA FITNESS</div><h1>Não foi possível abrir este painel</h1><p>{message}</p><a className="outline-button" href={`${window.location.pathname}`}>Ir para o início</a></main>;
}

function PageHeading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function Overview({ students, activeCount, onAdd, onOpen, onPage }) {
  const activeRate = students.length ? Math.round(activeCount / students.length * 100) : 0;
  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(new Date()), 60000);
    return () => window.clearInterval(interval);
  }, []);
  const hour = currentTime.getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const today = currentTime.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
  return (
    <>
      <PageHeading eyebrow={today} title={<>{greeting}, Gabriel <span className="wave">✦</span></>} description="Aqui está o resumo da sua consultoria hoje." action={<button className="primary-button" onClick={onAdd}><Icon name="plus" size={17} /> Novo aluno</button>} />
      <section className="stats-grid">
        <StatCard label="Alunos ativos" value={activeCount} trend={`${students.length} cadastrados no total`} icon="users" accent="green" />
        <StatCard label="Treinos atribuídos" value={students.filter((student) => !student.workout.startsWith('Nenhum')).length} trend="Planos em acompanhamento" icon="dumbbell" accent="orange" />
        <StatCard label="Planos alimentares" value={students.filter((student) => !student.diet.startsWith('Nenhum')).length} trend="Nutrição personalizada" icon="leaf" accent="blue" />
        <StatCard label="Adesão dos alunos" value={`${activeRate}%`} trend="Alunos com status ativo" icon="chart" accent="purple" />
      </section>

      <section className="content-grid">
        <div className="panel students-panel">
          <div className="panel-heading"><div><h2>Seus alunos</h2><p>Acompanhe quem está treinando com você.</p></div><button className="text-button" onClick={() => onPage('students')}>Ver todos <Icon name="arrow" size={14} /></button></div>
          <div className="student-table-wrap"><table><thead><tr><th>ALUNO</th><th>OBJETIVO</th><th>PESO ATUAL</th><th>STATUS</th><th /></tr></thead><tbody>
            {students.slice(0, 4).map((student, index) => <StudentRow key={student.id} student={student} index={index} onClick={() => onOpen(student)} />)}
          </tbody></table>{students.length === 0 && <EmptyState title="Nenhum aluno por aqui" text="Cadastre seu primeiro aluno para começar." />}</div>
        </div>
        <div className="panel progress-panel">
          <div className="panel-heading"><div><h2>Visão de progresso</h2><p>Resumo da sua carteira de alunos.</p></div><button className="small-icon-button" aria-label="Ver evolução" onClick={() => onPage('progress')}><Icon name="arrow" size={16} /></button></div>
          <div className="progress-highlight"><div><span>ALUNOS EM EVOLUÇÃO</span><strong>{students.filter((student) => student.history.length > 1).length}<small>/{students.length}</small></strong></div><div className="progress-ring"><span>{activeRate}<small>%</small></span></div></div>
          <div className="mini-chart"><div className="chart-lines"><i /><i /><i /><i /></div><svg viewBox="0 0 380 92" preserveAspectRatio="none" aria-label="Gráfico de tendência de acompanhamento"><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#76c69b" stopOpacity=".25" /><stop offset="100%" stopColor="#76c69b" stopOpacity="0" /></linearGradient></defs><path d="M0 70 C30 65 35 42 68 49 S104 64 133 43 S170 53 198 35 S240 42 267 25 S310 36 337 15 S363 19 380 6 L380 92 L0 92Z" fill="url(#chart-fill)" /><path d="M0 70 C30 65 35 42 68 49 S104 64 133 43 S170 53 198 35 S240 42 267 25 S310 36 337 15 S363 19 380 6" fill="none" stroke="#70c497" strokeWidth="2.5" /></svg></div>
          <div className="chart-foot"><span>Últimos 6 meses</span><span className="chart-legend"><i /> Acompanhamento</span></div>
        </div>
      </section>

      <section className="bottom-grid">
        <div className="panel attention-panel"><div className="panel-heading"><div><h2>Precisam de atenção</h2><p>Alunos que podem precisar de um contato.</p></div><span className="attention-badge">{students.filter((student) => student.status === 'Atenção').length}</span></div>
          {students.filter((student) => student.status === 'Atenção').length ? students.filter((student) => student.status === 'Atenção').map((student) => <button className="attention-item" key={student.id} onClick={() => onOpen(student)}><div className="avatar avatar-orange">{initials(student.name)}</div><span className="attention-name"><strong>{student.name}</strong><small>Último check-in: {student.lastCheckin}</small></span><span className="attention-action">Ver aluno <Icon name="chevron" size={15} /></span></button>) : <div className="all-good"><span>✓</span><p>Tudo em dia! Nenhum aluno precisa de atenção.</p></div>}
        </div>
        <div className="quote-card"><div className="quote-mark">“</div><blockquote>O sucesso é a soma de pequenos esforços repetidos dia após dia.</blockquote><span>ACOMPANHAMENTO QUE TRANSFORMA</span><div className="quote-decoration">GL<span>.</span></div></div>
      </section>
    </>
  );
}

function StatCard({ label, value, trend, icon, accent }) {
  return <div className="stat-card"><div className={`stat-icon ${accent}`}><Icon name={icon} size={19} /></div><span className="stat-label">{label}</span><div className="stat-value">{value}</div><div className="stat-trend"><span className="trend-dot" />{trend}</div></div>;
}

function StudentRow({ student, index = 0, onClick }) {
  return <tr onClick={onClick} className="clickable-row"><td><div className="student-cell"><div className={`avatar avatar-${['green', 'blue', 'orange', 'purple'][index % 4]}`}>{initials(student.name)}</div><div><strong>{student.name}</strong><small>{student.email}</small></div></div></td><td><span className="goal-pill">{student.goal}</span></td><td><strong className="weight-cell">{Number(student.weight).toFixed(1)} <small>kg</small></strong></td><td><span className={`status-pill ${student.status === 'Ativo' ? 'status-active' : 'status-attention'}`}><i />{student.status}</span></td><td><button className="row-arrow" aria-label={`Ver ${student.name}`}><Icon name="chevron" size={17} /></button></td></tr>;
}

function StudentsPage({ students, search, onSearch, onAdd, onOpen }) {
  return <>
    <PageHeading eyebrow="SUA EQUIPE" title="Meus alunos" description="Gerencie os cadastros e acompanhe cada jornada." action={<button className="primary-button" onClick={onAdd}><Icon name="plus" size={17} /> Novo aluno</button>} />
    <section className="panel directory-panel">
      <div className="directory-toolbar"><div><h2>Todos os alunos <span className="subtle-count">{students.length}</span></h2><p>Dados e acompanhamento individual.</p></div><label className="search-box"><Icon name="search" size={17} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar aluno..." /></label></div>
      {students.length ? <div className="student-table-wrap"><table><thead><tr><th>ALUNO</th><th>OBJETIVO</th><th>PESO ATUAL</th><th>ÚLTIMO CHECK-IN</th><th>STATUS</th><th /></tr></thead><tbody>
        {students.map((student, index) => <tr key={student.id} onClick={() => onOpen(student)} className="clickable-row"><td><div className="student-cell"><div className={`avatar avatar-${['green', 'blue', 'orange', 'purple'][index % 4]}`}>{initials(student.name)}</div><div><strong>{student.name}</strong><small>{student.email}</small></div></div></td><td><span className="goal-pill">{student.goal}</span></td><td><strong className="weight-cell">{Number(student.weight).toFixed(1)} <small>kg</small></strong></td><td className="muted-cell">{student.lastCheckin}</td><td><span className={`status-pill ${student.status === 'Ativo' ? 'status-active' : 'status-attention'}`}><i />{student.status}</span></td><td><button className="row-arrow" aria-label={`Ver ${student.name}`}><Icon name="chevron" size={17} /></button></td></tr>)}
      </tbody></table></div> : <EmptyState title="Nenhum resultado encontrado" text="Tente buscar por outro nome ou objetivo." />}
    </section>
  </>;
}

function StudentDetail({ student, onBack, onUpdate, onShare, onEnsureShare }) {
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [workoutEditorOpen, setWorkoutEditorOpen] = useState(false);
  const [dietEditorOpen, setDietEditorOpen] = useState(false);
  const [progressEntry, setProgressEntry] = useState(null);
  const [expandedChart, setExpandedChart] = useState(null);
  const [qrCodeOpen, setQrCodeOpen] = useState(false);
  const bmi = Number(student.weight) && Number(student.height) ? (Number(student.weight) / Number(student.height) ** 2).toFixed(1) : '—';
  const weightRecords = student.weightRecords || [];
  const previous = weightRecords.length > 1 ? weightRecords[weightRecords.length - 2].value : student.weight;
  const difference = (Number(student.weight) - Number(previous)).toFixed(1);
  const isWorkout = tab === 'workout';
  return <>
    <button className="back-link" onClick={onBack}><Icon name="chevron" size={15} /> Voltar para alunos</button>
    <div className="detail-heading"><div className="detail-person"><div className="avatar avatar-green large-avatar">{initials(student.name)}</div><div><div className="eyebrow">PERFIL DO ALUNO</div><h1>{student.name}</h1><p>{student.email} <span>·</span> Desde {formatDate(student.startDate)}</p></div></div><div className="detail-heading-actions"><button className="outline-button share-student-button" onClick={() => onShare(student)}><Icon name="share" size={15} /> Compartilhar link</button><button className="outline-button share-qr-button" onClick={() => setQrCodeOpen(true)}><Icon name="grid" size={15} /> Gerar QR Code</button><button className="outline-button" onClick={() => setEditing(true)}>Editar cadastro</button></div></div>
    <p className="share-privacy-note">O link permanente mostra treino, dieta e evolução atualizados quando o aluno abrir ou recarregar a página. Envie-o somente ao aluno.</p>
    <div className="detail-tabs">{[['overview', 'Visão geral'], ['workout', 'Treino'], ['diet', 'Plano alimentar']].map(([id, label]) => <button className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab === 'overview' ? <>
      <div className="detail-metrics">
        <MetricCard label="Peso atual" value={`${Number(student.weight).toFixed(1)} kg`} note={Number(difference) <= 0 ? `${difference} kg desde o início` : `+${difference} kg desde o início`} icon="chart" />
        <MetricCard label="Altura" value={student.height ? `${Number(student.height).toFixed(2)} m` : '—'} note="Última avaliação" icon="grid" />
        <MetricCard label="IMC estimado" value={bmi} note="Indicador de referência" icon="users" />
        <MetricCard label="Objetivo" value={student.goal} note={`Status: ${student.status}`} icon="arrow" />
      </div>
      <div className="content-grid detail-grid">
        <div className="panel detail-chart-panel"><div className="panel-heading"><div><h2>Evolução de peso</h2><p>Selecione um ponto para ver ou corrigir o registro.</p></div><div className="chart-actions"><button className="outline-button compact" onClick={() => setExpandedChart('weight')}>Ampliar</button><button className="outline-button compact" onClick={() => setProgressEntry({ type: 'weight' })}><Icon name="plus" size={14} /> Registrar</button></div></div><ProgressChart records={weightRecords} kind="weight" onEdit={(record) => setProgressEntry({ type: 'weight', record })} /></div>
        <div className="panel measurements-panel"><div className="panel-heading"><div><h2>Medidas corporais</h2><p>Selecione um ponto para ver ou corrigir as medidas.</p></div><div className="chart-actions"><button className="outline-button compact" onClick={() => setExpandedChart('measurements')}>Ampliar</button><button className="small-icon-button" onClick={() => setProgressEntry({ type: 'measurements' })} aria-label="Registrar medidas"><Icon name="plus" size={16} /></button></div></div><ProgressChart records={student.measurementRecords || []} kind="measurements" onEdit={(record) => setProgressEntry({ type: 'measurements', record })} /></div>
      </div>
      <div className="content-grid detail-assignment-grid"><AssignmentCard type="workout" title="Treino atual" value={student.workoutPlan?.name || student.workout} onClick={() => setTab('workout')} /><AssignmentCard type="nutrition" title="Plano alimentar" value={student.dietPlan?.name || student.diet} onClick={() => setTab('diet')} /></div>
    </> : isWorkout ? <WorkoutPlanView plan={student.workoutPlan || createWorkoutPlan(student.workout)} onEdit={() => setWorkoutEditorOpen(true)} /> : <DietPlanView plan={student.dietPlan || createDietPlan(student.diet)} onEdit={() => setDietEditorOpen(true)} />}
    {editing && <EditStudentModal student={student} onClose={() => setEditing(false)} onSave={(updates) => { onUpdate(student.id, updates); setEditing(false); }} />}
    {workoutEditorOpen && <WorkoutEditorModal student={student} onClose={() => setWorkoutEditorOpen(false)} onSave={(workoutPlan) => { onUpdate(student.id, { workoutPlan, workout: workoutPlan.name.trim() || 'Treino sem nome' }); setWorkoutEditorOpen(false); }} />}
    {dietEditorOpen && <DietEditorModal student={student} onClose={() => setDietEditorOpen(false)} onSave={(dietPlan) => { onUpdate(student.id, { dietPlan, diet: dietPlan.name.trim() || 'Plano alimentar' }); setDietEditorOpen(false); }} />}
    {progressEntry && <ProgressEntryModal student={student} type={progressEntry.type} record={progressEntry.record} onClose={() => setProgressEntry(null)} onSave={(updates) => { onUpdate(student.id, updates); setProgressEntry(null); }} />}
    {expandedChart && <ProgressChartModal student={student} kind={expandedChart} onClose={() => setExpandedChart(null)} onEdit={(record) => { setExpandedChart(null); setProgressEntry({ type: expandedChart, record }); }} />}
    {qrCodeOpen && <ShareQrModal student={student} onClose={() => setQrCodeOpen(false)} onEnsureShare={onEnsureShare} />}
  </>;
}

function WorkoutPlanView({ plan, onEdit, readOnly = false }) {
  const exerciseCount = plan.days.reduce((total, day) => total + day.exercises.length, 0);
  return <div className="workout-plan-view">
    <div className="workout-plan-heading"><div><div className="eyebrow">PLANILHA DE TREINO</div><h2>{plan.name || 'Novo treino'}</h2><p>{plan.days.length} {plan.days.length === 1 ? 'dia' : 'dias'} de treino <span>·</span> {exerciseCount} {exerciseCount === 1 ? 'exercício' : 'exercícios'}</p></div>{!readOnly && <button className="primary-button" onClick={onEdit}><Icon name="check" size={16} /> Editar planilha</button>}</div>
    {plan.days.map((day) => <section className="panel workout-day-panel" key={day.id}><div className="workout-day-heading"><div><span className="workout-day-tag">SESSÃO</span><h3>{day.name}</h3></div><span className="goal-pill">{day.exercises.length} exercícios</span></div>{day.exercises.length ? <div className="workout-table-wrap"><table className="workout-table"><thead><tr><th>EXERCÍCIO / EXEMPLO</th><th>SÉRIES</th><th>REPETIÇÕES</th><th>DESCANSO</th><th>OBSERVAÇÕES</th></tr></thead><tbody>{day.exercises.map((exercise) => { const image = exercise.imageId === 'none' ? '' : getExercise(exercise.imageId)?.image || getExercise(exercise.exerciseId)?.image || exercise.image; return <tr key={exercise.id}><td><div className="workout-exercise-cell">{image ? <ExerciseImage src={image} alt={`Exemplo ilustrado de ${exercise.name}`} /> : <span className="workout-exercise-no-image">Sem imagem</span>}<strong>{exercise.name}</strong></div></td><td>{exercise.sets}</td><td>{exercise.reps}</td><td>{exercise.rest}</td><td className="workout-notes">{exercise.notes || '—'}</td></tr>; })}</tbody></table></div> : <p className="workout-empty-day">Ainda não há exercícios nesta sessão.</p>}</section>)}
    {plan.days.length === 0 && <div className="panel"><EmptyState title="Sua ficha ainda está vazia" text="Adicione dias e exercícios para montar o treino." /></div>}
  </div>;
}

function MetricCard({ label, value, note, icon }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><Icon name={icon} size={17} /></div><strong>{value}</strong><small>{note}</small></div>;
}

const measurementSeries = [
  { key: 'chest', label: 'Peitoral', color: '#c59b27' },
  { key: 'waist', label: 'Cintura', color: '#4e9c73' },
  { key: 'hip', label: 'Quadril', color: '#6485bb' },
  { key: 'arm', label: 'Braço (geral)', color: '#a273ac' },
  { key: 'calfLeft', label: 'Panturrilha esquerda', color: '#d87548' },
  { key: 'calfRight', label: 'Panturrilha direita', color: '#ba6a47' },
  { key: 'quadricepsLeft', label: 'Quadríceps esquerdo', color: '#58a9a2' },
  { key: 'quadricepsRight', label: 'Quadríceps direito', color: '#408b85' },
  { key: 'forearmLeft', label: 'Antebraço esquerdo', color: '#8b78bb' },
  { key: 'forearmRight', label: 'Antebraço direito', color: '#705e9f' },
  { key: 'bicepsLeft', label: 'Bíceps esquerdo', color: '#cf7692' },
  { key: 'bicepsRight', label: 'Bíceps direito', color: '#ad5f79' },
  { key: 'glutes', label: 'Glúteos', color: '#8a9c42' },
  { key: 'neck', label: 'Pescoço', color: '#71889c' },
];

function ProgressChart({ records: sourceRecords, kind, onEdit, interactive = true, expanded = false }) {
  const isWeight = kind === 'weight';
  const series = isWeight ? [{ key: 'value', label: 'Peso', color: '#4e9c73' }] : measurementSeries;
  const records = [...sourceRecords].sort((first, second) => first.date.localeCompare(second.date));
  const [selectedDate, setSelectedDate] = useState(records[records.length - 1]?.date || null);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const chartScrollRef = useRef(null);
  const [availableWidth, setAvailableWidth] = useState(360);
  const chartHeight = expanded ? 280 : 165;
  const chartWidth = availableWidth;
  const horizontalPadding = 36;
  const verticalPadding = 20;
  useEffect(() => {
    const container = chartScrollRef.current;
    if (!container) return undefined;
    const updateWidth = () => setAvailableWidth(Math.max(180, Math.floor(container.clientWidth)));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  const pointsFor = (seriesItem) => {
    const numbers = records.flatMap((record) => Number(record[seriesItem.key]) > 0 ? [Number(record[seriesItem.key])] : []);
    if (!numbers.length) return [];
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    const range = Math.max(max - min, max * 0.06, 1);
    const bottom = Math.max(0, min - range * 0.2);
    const top = max + range * 0.2;
    return records.flatMap((record, index) => {
      const value = Number(record[seriesItem.key]);
      if (!value) return [];
      const x = records.length === 1 ? chartWidth / 2 : horizontalPadding + index * ((chartWidth - horizontalPadding * 2) / (records.length - 1));
      const y = chartHeight - verticalPadding - ((value - bottom) / (top - bottom || 1)) * (chartHeight - verticalPadding * 2);
      return [{ x, y, index, date: record.date, value, record }];
    });
  };
  const allPoints = series.flatMap((item) => pointsFor(item).map((point) => ({ ...point, series: item })));
  const tooltip = allPoints.find((point) => point.date === hoveredPoint?.date && point.series.key === hoveredPoint?.key);
  const selectedRecord = records.find((record) => record.date === selectedDate);
  const labelStep = Math.max(1, Math.ceil(records.length / (expanded ? 10 : 6)));

  function selectPoint(point) {
    if (!interactive) return;
    setSelectedDate(point.date);
  }

  function editSelected() {
    if (selectedRecord) onEdit?.(selectedRecord);
  }

  return <div className={`progress-chart ${expanded ? 'progress-chart-expanded' : ''}`}>
    <div className="chart-scroll" ref={chartScrollRef}><div className="chart-canvas" style={{ width: chartWidth, height: chartHeight }}>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={isWeight ? 'Gráfico de evolução do peso por data' : 'Gráfico de evolução das medidas por data'}>
        {[0, 1, 2, 3].map((line) => <line key={line} x1={horizontalPadding} x2={chartWidth - horizontalPadding} y1={verticalPadding + line * ((chartHeight - verticalPadding * 2) / 3)} y2={verticalPadding + line * ((chartHeight - verticalPadding * 2) / 3)} className="chart-grid-line" />)}
        {records.map((record, index) => {
          const x = records.length === 1 ? chartWidth / 2 : horizontalPadding + index * ((chartWidth - horizontalPadding * 2) / (records.length - 1));
          return index % labelStep === 0 || index === records.length - 1 ? <text key={record.date} x={x} y={chartHeight - 2} textAnchor="middle" className="chart-date-label">{formatChartDate(record.date)}</text> : null;
        })}
        {series.map((item) => {
          const points = pointsFor(item);
          return <g key={item.key}>
            {points.length > 1 && <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={item.color} strokeWidth={expanded ? 3 : 2.5} strokeLinecap="round" strokeLinejoin="round" />}
            {points.map((point) => {
              const selected = selectedDate === point.date;
              return <g key={`${point.date}-${item.key}`} className={`chart-point ${interactive ? 'interactive' : ''}`} tabIndex={interactive ? 0 : undefined} role={interactive ? 'button' : undefined} aria-label={interactive ? `${item.label}, ${point.value} ${isWeight ? 'kg' : 'cm'}, ${formatDate(point.date)}. Selecione para ver ou editar.` : undefined} onMouseEnter={() => interactive && setHoveredPoint({ date: point.date, key: item.key })} onMouseLeave={() => setHoveredPoint(null)} onFocus={() => interactive && setHoveredPoint({ date: point.date, key: item.key })} onBlur={() => setHoveredPoint(null)} onClick={(event) => { if (interactive) { event.stopPropagation(); selectPoint(point); } }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectPoint(point); } }}>
                <circle cx={point.x} cy={point.y} r={expanded ? 13 : 11} className="chart-point-hit" />
                <circle cx={point.x} cy={point.y} r={selected ? 6 : 4.5} fill="white" stroke={item.color} strokeWidth={selected ? 3 : 2.5} />
              </g>;
            })}
          </g>;
        })}
      </svg>
      {tooltip && <div className="chart-tooltip" style={{ left: `${tooltip.x / chartWidth * 100}%`, top: `${tooltip.y / chartHeight * 100}%` }}><strong>{tooltip.series.label}: {tooltip.value.toFixed(1)} {isWeight ? 'kg' : 'cm'}</strong><span>{formatDate(tooltip.date)}</span></div>}
    </div></div>
    {!isWeight && <div className="chart-legend">{measurementSeries.map((item) => <span key={item.key}><i style={{ backgroundColor: item.color }} />{item.label}</span>)}</div>}
    {interactive && selectedRecord && <div className="chart-selected-record"><div><strong>{formatDate(selectedRecord.date)}</strong>{isWeight ? <span>{Number(selectedRecord.value).toFixed(1)} kg</span> : <div className="selected-measurements">{measurementSeries.map((item) => <span key={item.key}><i style={{ backgroundColor: item.color }} />{item.label}: {Number(selectedRecord[item.key]) ? `${Number(selectedRecord[item.key]).toFixed(1)} cm` : '—'}</span>)}</div>}</div><button className="outline-button compact" onClick={editSelected}>Editar registro</button></div>}
    {interactive && !records.length && <div className="chart-empty">Ainda não há registros para exibir.</div>}
  </div>;
}

function WeightChart({ history }) {
  const records = history.map((record, index) => typeof record === 'number'
    ? { date: todayDate(), value: record, id: `${record}-${index}` }
    : record);
  return <ProgressChart records={records} kind="weight" interactive={false} />;
}

function ProgressChartModal({ student, kind, onClose, onEdit }) {
  const isWeight = kind === 'weight';
  const records = isWeight ? student.weightRecords || [] : student.measurementRecords || [];
  return <div className="modal-backdrop chart-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card chart-modal" role="dialog" aria-modal="true" aria-labelledby="expanded-chart-title">
    <div className="modal-heading"><div><div className="eyebrow">{student.name}</div><h2 id="expanded-chart-title">{isWeight ? 'Evolução de peso' : 'Evolução das medidas'}</h2><p>Passe sobre os pontos ou toque neles para ver os dados daquela data.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar gráfico"><Icon name="close" /></button></div>
    <ProgressChart records={records} kind={kind} expanded onEdit={onEdit} />
  </section></div>;
}

function formatChartDate(date) {
  if (!date) return '—';
  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function AssignmentCard({ type, title, value, onClick }) {
  const workout = type === 'workout';
  return <button className="panel assignment-card" onClick={onClick}><div className={`assignment-icon ${workout ? 'orange' : 'green'}`}><Icon name={workout ? 'dumbbell' : 'leaf'} size={18} /></div><div><span>{title}</span><strong>{value}</strong><small>{workout ? 'Exercícios e rotina semanal' : 'Orientações personalizadas'}</small></div><Icon name="chevron" size={17} /></button>;
}

function AssignmentsPage({ type, students, onOpen, onUpdate }) {
  const workout = type === 'workout';
  const title = workout ? 'Treinos' : 'Planos alimentares';
  const [editingWorkoutStudent, setEditingWorkoutStudent] = useState(null);
  const [editingDietStudent, setEditingDietStudent] = useState(null);
  return <>
    <PageHeading eyebrow={workout ? 'PRESCRIÇÃO E ROTINA' : 'NUTRIÇÃO PERSONALIZADA'} title={title} description={workout ? 'Organize as rotinas de exercícios por aluno.' : 'Acompanhe as estratégias alimentares dos seus alunos.'} action={<span className="header-count">{students.length} alunos</span>} />
    <div className="assignment-list">{students.length ? students.map((student, index) => <div className="panel assignment-list-card" key={student.id}><div className={`assignment-icon ${workout ? 'orange' : 'green'}`}><Icon name={workout ? 'dumbbell' : 'leaf'} size={18} /></div><div className="assignment-student"><div className={`avatar avatar-${['green', 'blue', 'orange', 'purple'][index % 4]}`}>{initials(student.name)}</div><div><strong>{student.name}</strong><small>{student.goal}</small></div></div><div className="assignment-current"><small>{workout ? 'TREINO ATUAL' : 'PLANO ATUAL'}</small><strong>{workout ? student.workoutPlan?.name || student.workout : student.dietPlan?.name || student.diet}</strong>{workout && <span>{student.workoutPlan?.days.reduce((total, day) => total + day.exercises.length, 0) || 0} exercícios cadastrados</span>}{!workout && <span>{student.dietPlan?.meals.length || 0} refeições cadastradas</span>}</div><button className="outline-button compact" onClick={() => workout ? setEditingWorkoutStudent(student) : setEditingDietStudent(student)}>Editar planilha</button><button className="row-arrow" onClick={() => onOpen(student)} aria-label={`Ver perfil de ${student.name}`}><Icon name="chevron" size={17} /></button></div>) : <div className="panel"><EmptyState title="Cadastre seu primeiro aluno" text="Os planos serão organizados aqui por aluno." /></div>}</div>
    {editingWorkoutStudent && <WorkoutEditorModal student={editingWorkoutStudent} onClose={() => setEditingWorkoutStudent(null)} onSave={(workoutPlan) => { onUpdate(editingWorkoutStudent.id, { workoutPlan, workout: workoutPlan.name.trim() || 'Treino sem nome' }); setEditingWorkoutStudent(null); }} />}
    {editingDietStudent && <DietEditorModal student={editingDietStudent} onClose={() => setEditingDietStudent(null)} onSave={(dietPlan) => { onUpdate(editingDietStudent.id, { dietPlan, diet: dietPlan.name.trim() || 'Plano alimentar' }); setEditingDietStudent(null); }} />}
  </>;
}

function ExerciseImage({ src, alt }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function closeOnEscape(event) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  return <>
    <button type="button" className="exercise-image-button" onClick={() => setIsOpen(true)} aria-label={`Ampliar imagem: ${alt}`}>
      <img src={src} alt={alt} />
    </button>
    {isOpen && createPortal(
      <div className="exercise-image-lightbox" onMouseDown={(event) => event.target === event.currentTarget && setIsOpen(false)}>
        <div className="exercise-image-lightbox-header">
          <p>{alt}</p>
          <button type="button" className="icon-button" onClick={() => setIsOpen(false)} aria-label="Fechar imagem ampliada"><Icon name="close" /></button>
        </div>
        <div className="exercise-image-viewer">
          <img src={src} alt={alt} draggable="false" />
        </div>
        <div className="exercise-image-controls"><span>100% · resolução original</span></div>
      </div>,
      document.body,
    )}
  </>;
}

function WorkoutEditorModal({ student, onClose, onSave }) {
  const [plan, setPlan] = useState(() => JSON.parse(JSON.stringify(student.workoutPlan || createWorkoutPlan(student.workout || 'Novo treino'))));
  const [activeDayId, setActiveDayId] = useState(() => plan.days[0]?.id);
  const activeDay = plan.days.find((day) => day.id === activeDayId);

  function updateDay(dayId, updates) {
    setPlan((current) => ({ ...current, days: current.days.map((day) => day.id === dayId ? { ...day, ...updates } : day) }));
  }

  function addDay() {
    const day = { id: `day-${Math.random().toString(36).slice(2, 9)}`, name: `Treino ${plan.days.length + 1}`, exercises: [] };
    setPlan((current) => ({ ...current, days: [...current.days, day] }));
    setActiveDayId(day.id);
  }

  function removeDay(dayId) {
    const remainingDays = plan.days.filter((day) => day.id !== dayId);
    const nextDays = remainingDays.length ? remainingDays : [{ id: `day-${Math.random().toString(36).slice(2, 9)}`, name: 'Treino A', exercises: [] }];
    setPlan((current) => ({ ...current, days: nextDays }));
    setActiveDayId(nextDays[0].id);
  }

  function addExercise() {
    updateDay(activeDay.id, { exercises: [...activeDay.exercises, createWorkoutExercise()] });
  }

  function addCustomExercise() {
    const exercise = {
      id: `custom-${Math.random().toString(36).slice(2, 9)}`,
      exerciseId: 'custom',
      imageId: 'none',
      name: '',
      image: '',
      sets: '3',
      reps: '10-12',
      rest: '60s',
      notes: '',
    };
    updateDay(activeDay.id, { exercises: [...activeDay.exercises, exercise] });
  }

  function updateExercise(exerciseId, field, value) {
    const selectedExercise = field === 'exerciseId' ? getExercise(value) : null;
    const selectedImage = field === 'imageId' ? getExercise(value) : null;
    const exercises = activeDay.exercises.map((exercise) => {
      if (exercise.id !== exerciseId) return exercise;
      if (field === 'exerciseId' && selectedExercise) return { ...exercise, exerciseId: selectedExercise.id, name: selectedExercise.name, imageId: selectedExercise.id, image: selectedExercise.image, sets: selectedExercise.sets, reps: selectedExercise.reps, rest: selectedExercise.rest };
      if (field === 'exerciseId') return { ...exercise, exerciseId: 'custom', name: '', imageId: 'none', image: '' };
      if (field === 'imageId') return value === 'custom'
        ? { ...exercise, imageId: value }
        : { ...exercise, imageId: value, image: selectedImage?.image || '' };
      return { ...exercise, [field]: value };
    });
    updateDay(activeDay.id, { exercises });
  }

  function removeExercise(exerciseId) {
    updateDay(activeDay.id, { exercises: activeDay.exercises.filter((exercise) => exercise.id !== exerciseId) });
  }

  function submit(event) {
    event.preventDefault();
    const updatedPlan = {
      ...plan,
      name: plan.name.trim() || 'Treino sem nome',
      days: plan.days.map((day) => ({
        ...day,
        name: day.name.trim() || 'Novo dia',
        exercises: day.exercises.filter((exercise) => exercise.name.trim()).map((exercise) => ({ ...exercise, name: exercise.name.trim() })),
      })),
    };
    onSave(updatedPlan);
  }

  return <div className="modal-backdrop workout-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card workout-editor-modal" role="dialog" aria-modal="true" aria-labelledby="workout-editor-title">
    <div className="modal-heading"><div><div className="eyebrow">PLANILHA INDIVIDUAL</div><h2 id="workout-editor-title">Treino de {student.name}</h2><p>Organize as sessões e os exercícios do aluno.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button></div>
    <form onSubmit={submit}>
      <label className="form-field workout-name-field">Nome do plano<input value={plan.name} onChange={(event) => setPlan((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Treino de força e condicionamento" /></label>
      <div className="workout-days-toolbar"><div className="workout-day-tabs">{plan.days.map((day) => <button type="button" className={`workout-day-tab ${activeDayId === day.id ? 'active' : ''}`} key={day.id} onClick={() => setActiveDayId(day.id)}>{day.name}</button>)}</div><button type="button" className="outline-button compact" onClick={addDay}><Icon name="plus" size={14} /> Adicionar dia</button></div>
      {activeDay && <div className="workout-editor-day"><div className="workout-editor-day-heading"><label className="form-field">Nome da sessão<input value={activeDay.name} onChange={(event) => updateDay(activeDay.id, { name: event.target.value })} /></label><button type="button" className="remove-day-button" onClick={() => removeDay(activeDay.id)}>Remover dia</button></div>
        <div className="workout-editor-table-wrap"><table className="workout-editor-table"><thead><tr><th>EXERCÍCIO E EXEMPLO</th><th>SÉRIES</th><th>REPETIÇÕES</th><th>DESCANSO</th><th>OBSERVAÇÕES</th><th /></tr></thead><tbody>{activeDay.exercises.map((exercise) => <FixedWorkoutExerciseRow key={exercise.id} exercise={exercise} onUpdate={updateExercise} onRemove={removeExercise} />)}</tbody></table></div>
        {activeDay.exercises.length === 0 && <div className="workout-editor-empty">Adicione exercícios para preencher esta sessão.</div>}
        <div className="workout-editor-add-actions"><button type="button" className="add-exercise-button" onClick={addExercise}><Icon name="plus" size={15} /> Adicionar do catálogo</button><button type="button" className="add-exercise-button" onClick={addCustomExercise}><Icon name="plus" size={15} /> Adicionar personalizado</button></div>
      </div>}
      <div className="modal-footer"><button type="button" className="outline-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button"><Icon name="check" size={16} /> Salvar planilha</button></div>
    </form>
  </section></div>;
}

function FixedWorkoutExerciseRow({ exercise, onUpdate, onRemove }) {
  const image = exercise.imageId === 'none' ? '' : getExercise(exercise.imageId)?.image || getExercise(exercise.exerciseId)?.image || exercise.image;
  const isCustomExercise = exercise.exerciseId === 'custom';
  return <tr>
    <td>
      <div className="editor-exercise">
        {image ? <ExerciseImage src={image} alt={`Exemplo ilustrado de ${exercise.name || 'exercício'}`} /> : <span className="workout-exercise-no-image">Sem imagem</span>}
        <div className="editor-exercise-fields">
          <label className="exercise-picker-label">Exercício
            <select aria-label="Selecionar exercício" value={getExercise(exercise.exerciseId) ? exercise.exerciseId : 'custom'} onChange={(event) => onUpdate(exercise.id, 'exerciseId', event.target.value)}>
              <option value="custom">Exercício personalizado</option>
              {exerciseCategories.map((category) => <optgroup label={category} key={category}>{exerciseLibrary.filter((item) => item.category === category).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</optgroup>)}
            </select>
          </label>
          {isCustomExercise && <>
            <input aria-label="Nome do exercício personalizado" value={exercise.name} onChange={(event) => onUpdate(exercise.id, 'name', event.target.value)} placeholder="Digite o nome do exercício" />
            <label className="image-picker">Imagem de exemplo
              <select aria-label="Imagem de exemplo" value={exercise.imageId || (exercise.image ? 'custom' : 'none')} onChange={(event) => onUpdate(exercise.id, 'imageId', event.target.value)}>
                <option value="none">Sem imagem</option>
                {exerciseLibrary.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                {exercise.imageId === 'custom' && <option value="custom">Imagem existente</option>}
              </select>
            </label>
          </>}
        </div>
      </div>
    </td>
    {[
      ['sets', 'Séries', '3'],
      ['reps', 'Repetições', '10-12'],
      ['rest', 'Descanso', '60s'],
    ].map(([field, label, placeholder]) => <td key={field}><input className="sheet-input short" aria-label={label} value={exercise[field]} onChange={(event) => onUpdate(exercise.id, field, event.target.value)} placeholder={placeholder} /></td>)}
    <td><input className="sheet-input notes-input" aria-label="Observações" value={exercise.notes} onChange={(event) => onUpdate(exercise.id, 'notes', event.target.value)} placeholder="Ex.: controlar a descida" /></td>
    <td><button type="button" className="remove-exercise-button" onClick={() => onRemove(exercise.id)} aria-label={`Remover ${exercise.name}`}><Icon name="close" size={15} /></button></td>
  </tr>;
}

function DietPlanView({ plan, onEdit }) {
  const meals = plan.meals || [];
  return <section className="panel diet-plan-view">
    <div className="workout-plan-heading"><div><div className="eyebrow">PLANILHA ALIMENTAR</div><h2>{plan.name}</h2><p>Refeições e orientações personalizadas, organizadas ao longo do dia.</p></div>{onEdit && <button className="primary-button" onClick={onEdit}><Icon name="plus" size={16} /> Editar planilha</button>}</div>
    {meals.length ? <div className="diet-meal-list">{meals.map((meal) => <article className="diet-meal-card" key={meal.id}>
      <header><div><span>{meal.time || 'HORÁRIO LIVRE'}</span><h3>{meal.name || 'Refeição'}</h3></div></header>
      <ul className="diet-food-list">{meal.foods.map((food) => <li key={food.id}><span className="diet-food-name">{food.name || 'Alimento'}</span><span className="diet-food-quantity">{food.quantity || 'Quantidade não informada'}</span></li>)}</ul>
      {!meal.foods.length && <p className="diet-no-foods">Nenhum alimento adicionado a esta refeição.</p>}
      {meal.notes && <p className="diet-meal-notes">{meal.notes}</p>}
    </article>)}</div> : <div className="diet-empty"><span className="assignment-large-icon green"><Icon name="leaf" size={22} /></span><strong>Nenhuma refeição cadastrada</strong><p>Monte a planilha alimentar com refeições e uma lista de alimentos e quantidades.</p>{onEdit && <button className="outline-button compact" onClick={onEdit}><Icon name="plus" size={14} /> Adicionar refeições</button>}</div>}
  </section>;
}

function DietEditorModal({ student, onClose, onSave }) {
  const [plan, setPlan] = useState(() => JSON.parse(JSON.stringify(student.dietPlan || createDietPlan(student.diet))));
  function updateMeal(mealId, field, value) {
    setPlan((current) => ({ ...current, meals: current.meals.map((meal) => meal.id === mealId ? { ...meal, [field]: value } : meal) }));
  }
  function updateFood(mealId, foodId, field, value) {
    setPlan((current) => ({ ...current, meals: current.meals.map((meal) => meal.id !== mealId ? meal : { ...meal, foods: meal.foods.map((food) => food.id === foodId ? { ...food, [field]: value } : food) }) }));
  }
  function addMeal() {
    setPlan((current) => ({ ...current, meals: [...current.meals, { id: `meal-${Math.random().toString(36).slice(2, 9)}`, time: '', name: '', foods: [], notes: '' }] }));
  }
  function addFood(mealId) {
    setPlan((current) => ({ ...current, meals: current.meals.map((meal) => meal.id === mealId ? { ...meal, foods: [...meal.foods, { id: `food-${Math.random().toString(36).slice(2, 9)}`, name: '', quantity: '' }] } : meal) }));
  }
  function removeFood(mealId, foodId) {
    setPlan((current) => ({ ...current, meals: current.meals.map((meal) => meal.id === mealId ? { ...meal, foods: meal.foods.filter((food) => food.id !== foodId) } : meal) }));
  }
  function removeMeal(mealId) {
    setPlan((current) => ({ ...current, meals: current.meals.filter((meal) => meal.id !== mealId) }));
  }
  function submit(event) {
    event.preventDefault();
    onSave({
      ...plan,
      name: plan.name.trim() || 'Plano alimentar',
      meals: plan.meals.map((meal) => ({ ...meal, name: meal.name.trim() || 'Refeição', foods: meal.foods.filter((food) => food.name.trim() || food.quantity.trim()).map((food) => ({ ...food, name: food.name.trim() })) })),
    });
  }
  return <div className="modal-backdrop workout-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card workout-editor-modal diet-editor-modal" role="dialog" aria-modal="true" aria-labelledby="diet-editor-title">
    <div className="modal-heading"><div><div className="eyebrow">PLANILHA INDIVIDUAL</div><h2 id="diet-editor-title">Plano alimentar de {student.name}</h2><p>Organize os horários, alimentos, quantidades e observações.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button></div>
    <form onSubmit={submit}>
      <label className="form-field workout-name-field">Nome do plano<input value={plan.name} onChange={(event) => setPlan((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Plano alimentar — rotina de treino" /></label>
      <div className="diet-editor-meals">{plan.meals.map((meal) => <section className="diet-editor-meal" key={meal.id}>
        <div className="diet-editor-meal-heading"><label className="form-field">Nome da refeição<input value={meal.name} onChange={(event) => updateMeal(meal.id, 'name', event.target.value)} placeholder="Ex.: Café da manhã" /></label><label className="form-field diet-time-field">Horário<input type="time" value={meal.time} onChange={(event) => updateMeal(meal.id, 'time', event.target.value)} /></label><button type="button" className="remove-day-button" onClick={() => removeMeal(meal.id)}>Remover refeição</button></div>
        <div className="diet-editor-foods"><div className="diet-editor-foods-heading"><strong>Alimentos e quantidades</strong><button type="button" className="add-exercise-button" onClick={() => addFood(meal.id)}><Icon name="plus" size={14} /> Adicionar alimento</button></div>
          {meal.foods.map((food, index) => <div className="diet-editor-food-row" key={food.id}><label className="form-field">Alimento {index + 1}<input aria-label={`Nome do alimento ${index + 1}`} value={food.name} onChange={(event) => updateFood(meal.id, food.id, 'name', event.target.value)} placeholder="Ex.: Aveia" /></label><label className="form-field">Quantidade<input aria-label={`Quantidade do alimento ${index + 1}`} value={food.quantity} onChange={(event) => updateFood(meal.id, food.id, 'quantity', event.target.value)} placeholder="Ex.: 30 g" /></label><button type="button" className="remove-exercise-button" onClick={() => removeFood(meal.id, food.id)} aria-label={`Remover ${food.name || `alimento ${index + 1}`}`}><Icon name="close" size={15} /></button></div>)}
          {!meal.foods.length && <p className="diet-no-foods">Adicione cada alimento separadamente para criar uma lista que poderá ser marcada.</p>}
        </div>
        <label className="form-field diet-notes-field">Observações<textarea className="sheet-input diet-textarea" value={meal.notes} onChange={(event) => updateMeal(meal.id, 'notes', event.target.value)} placeholder="Orientações adicionais" /></label>
      </section>)}</div>
      {!plan.meals.length && <div className="workout-editor-empty">Adicione refeições para preencher a planilha alimentar.</div>}
      <button type="button" className="add-exercise-button" onClick={addMeal}><Icon name="plus" size={15} /> Adicionar refeição</button>
      <div className="modal-footer"><button type="button" className="outline-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button"><Icon name="check" size={16} /> Salvar planilha</button></div>
    </form>
  </section></div>;
}

function ProgressEntryModal({ student, type, record, onClose, onSave }) {
  const isWeight = type === 'weight';
  const latest = student.measurements || {};
  const measurementValues = Object.fromEntries(measurementSeries.map(({ key }) => [
    key,
    record ? record[key] ?? '' : latest[key] ?? '',
  ]));
  const [form, setForm] = useState(isWeight
    ? { date: record?.date || todayDate(), value: String(record?.value ?? student.weight ?? '') }
    : { date: record?.date || todayDate(), ...measurementValues });
  const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault();
    if (!form.date) return setError('Informe a data do registro.');
    if (isWeight) {
      const value = Number(form.value);
      if (!value || value < 1) return setError('Informe um peso válido.');
      const records = (student.weightRecords || []).filter((item) => item.date !== (record?.date || form.date) && item.date !== form.date);
      records.push({ date: form.date, value });
      records.sort((first, second) => first.date.localeCompare(second.date));
      const currentWeight = records[records.length - 1].value;
      onSave({ weight: currentWeight, weightRecords: records, history: records.map((record) => record.value) });
      return;
    }
    const measurements = Object.fromEntries(measurementSeries.map(({ key }) => [key, Number(form[key]) || 0]));
    if (!Object.values(measurements).some(Boolean)) return setError('Informe pelo menos uma medida.');
    const records = (student.measurementRecords || []).filter((item) => item.date !== (record?.date || form.date) && item.date !== form.date);
    records.push({ date: form.date, ...measurements });
    records.sort((first, second) => first.date.localeCompare(second.date));
    const currentRecord = records[records.length - 1];
    onSave({ measurements: Object.fromEntries(measurementSeries.map(({ key }) => [key, currentRecord[key] || 0])), measurementRecords: records });
  }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card progress-entry-modal" role="dialog" aria-modal="true" aria-labelledby="progress-entry-title">
    <div className="modal-heading"><div><div className="eyebrow">ACOMPANHAMENTO</div><h2 id="progress-entry-title">{record ? 'Editar registro' : isWeight ? 'Registrar peso' : 'Atualizar medidas'}</h2><p>{student.name} · os registros ficam salvos no histórico.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button></div>
    <form onSubmit={submit}><div className="form-grid">
      <label className="form-field full">Data do registro<input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} required /></label>
      {isWeight ? <label className="form-field full">Peso (kg)<input type="number" min="1" step="0.1" value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} required autoFocus /></label> : measurementSeries.map(({ key, label }) => <label className="form-field" key={key}>{label} (cm)<input type="number" min="0" step="0.1" value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} placeholder="—" /></label>)}
    </div>{error && <p className="form-error">{error}</p>}<div className="modal-footer"><button type="button" className="outline-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button"><Icon name="check" size={16} /> Salvar registro</button></div></form>
  </section></div>;
}

function ProgressPage({ students, onOpen }) {
  return <>
    <PageHeading eyebrow="RESULTADOS E CONSTÂNCIA" title="Evolução dos alunos" description="Acompanhe as mudanças registradas em cada jornada." action={<span className="header-count">{students.length} acompanhamentos</span>} />
    <div className="progress-cards">{students.length ? students.map((student, index) => {
      const start = student.weightRecords?.[0]?.value || student.history?.[0] || student.weight;
      const change = (Number(student.weight) - Number(start)).toFixed(1);
      return <button className="panel evolution-card" key={student.id} onClick={() => onOpen(student)}><div className="evolution-top"><div className={`avatar avatar-${['green', 'blue', 'orange', 'purple'][index % 4]}`}>{initials(student.name)}</div><span className={`status-pill ${student.status === 'Ativo' ? 'status-active' : 'status-attention'}`}><i />{student.status}</span></div><div className="evolution-person"><strong>{student.name}</strong><small>{student.goal}</small></div><div className="evolution-numbers"><div><small>PESO ATUAL</small><strong>{Number(student.weight).toFixed(1)} <span>kg</span></strong></div><div className={Number(change) <= 0 ? 'change-positive' : 'change-neutral'}><small>VARIAÇÃO</small><strong>{Number(change) > 0 ? '+' : ''}{change} <span>kg</span></strong></div></div><WeightChart history={student.weightRecords || student.history || [Number(student.weight)]} /><div className="evolution-footer">Ver acompanhamento <Icon name="arrow" size={14} /></div></button>;
    }) : <div className="panel"><EmptyState title="Nenhum dado para mostrar" text="Cadastre alunos para acompanhar a evolução." /></div>}</div>
  </>;
}

function EmptyState({ title, text }) {
  return <div className="empty-state"><span><Icon name="search" size={20} /></span><strong>{title}</strong><p>{text}</p></div>;
}

function AddStudentModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', goal: 'Emagrecimento', weight: '', height: '', startDate: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) return setError('Informe o nome do aluno.');
    if (!form.email.trim()) return setError('Informe o e-mail do aluno.');
    if (!Number(form.weight) || !Number(form.height)) return setError('Informe peso e altura válidos.');
    onSave({ ...form, name: form.name.trim(), email: form.email.trim(), weight: Number(form.weight), height: Number(form.height) });
  }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-student-title"><div className="modal-heading"><div><div className="eyebrow">NOVO CADASTRO</div><h2 id="new-student-title">Adicionar aluno</h2><p>Preencha os dados iniciais para começar o acompanhamento.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button></div><form onSubmit={submit}><div className="form-grid"><label className="form-field full">Nome completo<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Ana Silva" autoFocus /></label><label className="form-field">E-mail<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="aluno@email.com" /></label><label className="form-field">Telefone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="(11) 99999-9999" /></label><label className="form-field">Objetivo<select value={form.goal} onChange={(event) => setForm({ ...form, goal: event.target.value })}><option>Emagrecimento</option><option>Hipertrofia</option><option>Condicionamento</option><option>Saúde e bem-estar</option><option>Performance</option></select></label><label className="form-field">Data de início<input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label><label className="form-field">Peso atual (kg)<input type="number" step="0.1" min="1" value={form.weight} onChange={(event) => setForm({ ...form, weight: event.target.value })} placeholder="Ex.: 68.5" /></label><label className="form-field">Altura (m)<input type="number" step="0.01" min="0.5" value={form.height} onChange={(event) => setForm({ ...form, height: event.target.value })} placeholder="Ex.: 1.70" /></label></div>{error && <p className="form-error">{error}</p>}<div className="modal-footer"><button type="button" className="outline-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button"><Icon name="plus" size={16} /> Cadastrar aluno</button></div></form></section></div>;
}

function EditStudentModal({ student, onClose, onSave }) {
  const [form, setForm] = useState({
    name: student.name,
    email: student.email,
    phone: student.phone || '',
    goal: student.goal,
    weight: student.weight,
    height: student.height,
    status: student.status,
    diet: student.diet,
    ...Object.fromEntries(measurementSeries.map(({ key }) => [key, student.measurements?.[key] || ''])),
  });
  function submit(event) {
    event.preventDefault();
    const weight = Number(form.weight);
    const measurements = Object.fromEntries(measurementSeries.map(({ key }) => [key, Number(form[key]) || 0]));
    const weightRecords = [...(student.weightRecords || [])];
    if (weight !== Number(student.weight)) {
      const todayRecordIndex = weightRecords.findIndex((record) => record.date === todayDate());
      if (todayRecordIndex >= 0) weightRecords[todayRecordIndex] = { date: todayDate(), value: weight };
      else weightRecords.push({ date: todayDate(), value: weight });
      weightRecords.sort((first, second) => first.date.localeCompare(second.date));
    }
    const measurementRecords = [...(student.measurementRecords || [])];
    const measurementsChanged = measurementSeries.some(({ key }) => Number(student.measurements?.[key] || 0) !== measurements[key]);
    if (measurementsChanged) {
      const todayRecordIndex = measurementRecords.findIndex((record) => record.date === todayDate());
      const record = { date: todayDate(), ...measurements };
      if (todayRecordIndex >= 0) measurementRecords[todayRecordIndex] = record;
      else measurementRecords.push(record);
      measurementRecords.sort((first, second) => first.date.localeCompare(second.date));
    }
    const dietPlan = { ...(student.dietPlan || createDietPlan()), name: form.diet.trim() || 'Plano alimentar' };
    onSave({ ...form, diet: dietPlan.name, dietPlan, weight, height: Number(form.height), measurements, weightRecords, history: weightRecords.map((record) => record.value), measurementRecords });
  }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-student-title"><div className="modal-heading"><div><div className="eyebrow">PERFIL DO ALUNO</div><h2 id="edit-student-title">Atualizar informações</h2><p>As alterações serão salvas automaticamente no seu navegador.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button></div><form onSubmit={submit}><div className="form-grid"><label className="form-field">Nome completo<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="form-field">E-mail<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label className="form-field">Telefone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label className="form-field">Objetivo<select value={form.goal} onChange={(event) => setForm({ ...form, goal: event.target.value })}><option>Emagrecimento</option><option>Hipertrofia</option><option>Condicionamento</option><option>Saúde e bem-estar</option><option>Performance</option></select></label><label className="form-field">Peso atual (kg)<input required type="number" step="0.1" min="1" value={form.weight} onChange={(event) => setForm({ ...form, weight: event.target.value })} /></label><label className="form-field">Altura (m)<input required type="number" step="0.01" min="0.5" value={form.height} onChange={(event) => setForm({ ...form, height: event.target.value })} /></label><label className="form-field">Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option>Ativo</option><option>Atenção</option><option>Inativo</option></select></label></div><div className="form-section-label">MEDIDAS CORPORAIS (CM)</div><div className="form-grid measurement-inputs">{measurementSeries.map(({ key, label }) => <label className="form-field" key={key}>{label}<input type="number" step="0.1" min="0" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} placeholder="—" /></label>)}</div><div className="form-section-label">PRESCRIÇÃO ATUAL</div><div className="form-grid"><label className="form-field full">Plano alimentar<input value={form.diet} onChange={(event) => setForm({ ...form, diet: event.target.value })} /></label></div><div className="modal-footer"><button type="button" className="outline-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button"><Icon name="check" size={16} /> Salvar alterações</button></div></form></section></div>;
}
