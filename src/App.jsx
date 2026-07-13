import React, { useState, useMemo, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, where } from 'firebase/firestore';
import { 
  Calendar, Users, BarChart2, Plus, 
  MapPin, Clock, Trophy, Shield, Lock, 
  ChevronRight, ChevronLeft, X, Play, Edit, Trash2, CheckCircle, Activity, List, LogOut, Share2, MessageCircle, Footprints, Settings, Target, Undo, Redo,
  MousePointer, ArrowUpRight, TrendingUp, Square, XCircle, Video, PlayCircle, Layers, RotateCcw
} from 'lucide-react';

// ==========================================
// Firebase 설정
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyCO99Km34_p0paqFM8wbWD0odUU8UJ9ph4",
  authDomain: "matchboard-d010e.firebaseapp.com",
  projectId: "matchboard-d010e",
  storageBucket: "matchboard-d010e.firebasestorage.app",
  messagingSenderId: "693534026774",
  appId: "1:693534026774:web:a61dd8607c492e5e7c1937",
  measurementId: "G-VVB38BS06J"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// 상수 및 헬퍼 함수
// ==========================================
const TEAM_LETTERS = ['A', 'B', 'C', 'D'];
const TEAM_COLORS = {
  'A': 'text-red-400 bg-red-500/10 border-red-500/30',
  'B': 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  'C': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  'D': 'text-green-400 bg-green-500/10 border-green-500/30'
};
const TEAM_TEXT_COLORS = { 'A': 'text-red-400', 'B': 'text-blue-400', 'C': 'text-yellow-400', 'D': 'text-green-400' };

const resizeImage = (file, maxWidth = 300, maxHeight = 300) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
        } else {
          if (height > maxHeight) { width = Math.round((width * maxHeight) / height); height = maxHeight; }
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8)); 
      };
    };
    reader.readAsDataURL(file);
  });
};

const loadHtml2Canvas = () => {
  return new Promise((resolve, reject) => {
    if (window.html2canvas) { resolve(window.html2canvas); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.onload = () => resolve(window.html2canvas);
    script.onerror = () => reject(new Error('html2canvas 라이브러리 로드 실패'));
    document.head.appendChild(script);
  });
};

const calculateStandings = (match) => {
  const stats = {};
  TEAM_LETTERS.slice(0, match.teamCount).forEach(t => {
    stats[t] = { team: t, matches: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
  });

  (match.quarterScores || []).forEach(qs => {
    const { team1, team2, score1, score2 } = qs;
    if (!stats[team1] || !stats[team2]) return;
    stats[team1].matches++; stats[team2].matches++;
    stats[team1].gf += score1; stats[team1].ga += score2;
    stats[team2].gf += score2; stats[team2].ga += score1;

    if (score1 > score2) { stats[team1].w++; stats[team2].l++; stats[team1].pts += 3; }
    else if (score1 < score2) { stats[team2].w++; stats[team1].l++; stats[team2].pts += 3; }
    else { stats[team1].d++; stats[team2].d++; stats[team1].pts += 1; stats[team2].pts += 1; }
  });

  Object.values(stats).forEach(s => s.gd = s.gf - s.ga);
  return Object.values(stats).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    return b.gf - a.gf;
  });
};

const formatTimeAmPm = (timeStr) => {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? '오후' : '오전';
  const formattedHour = hour % 12 || 12;
  return `${ampm} ${formattedHour}:${m}`;
};

const getTodayString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getInitialTacticsTokens = (pitchType) => {
  const tokens = [];
  if (pitchType === 'full') {
    tokens.push({ id: 'A_GK', position: 'GK', name: '', x: 50, y: 92, team: 'A' });
    tokens.push({ id: 'A_LB', position: 'LB', name: '', x: 20, y: 75, team: 'A' }, { id: 'A_CB1', position: 'CB', name: '', x: 40, y: 75, team: 'A' }, { id: 'A_CB2', position: 'CB', name: '', x: 60, y: 75, team: 'A' }, { id: 'A_RB', position: 'RB', name: '', x: 80, y: 75, team: 'A' });
    tokens.push({ id: 'A_LM', position: 'WF', name: '', x: 20, y: 60, team: 'A' }, { id: 'A_CM1', position: 'CM', name: '', x: 40, y: 60, team: 'A' }, { id: 'A_CM2', position: 'CM', name: '', x: 60, y: 60, team: 'A' }, { id: 'A_RM', position: 'WF', name: '', x: 80, y: 60, team: 'A' });
    tokens.push({ id: 'A_FW1', position: 'FW', name: '', x: 35, y: 45, team: 'A' }, { id: 'A_FW2', position: 'FW', name: '', x: 65, y: 45, team: 'A' });
    tokens.push({ id: 'ball', label: '⚽', x: 50, y: 50, team: 'ball' });
  } else {
    tokens.push({ id: 'A_GK', position: 'GK', name: '', x: 50, y: 80, team: 'A' });
    for(let i=1; i<=5; i++) tokens.push({ id: `A_p${i}`, position: 'CM', name: '', x: 15 + i*12, y: 65, team: 'A' });
    tokens.push({ id: 'ball', label: '⚽', x: 50, y: 50, team: 'ball' });
  }
  return tokens;
};

// ==========================================
// 메인 App 컴포넌트
// ==========================================
export default function App() {
  const [user, setUser] = useState(null);
  const [appState, setAppState] = useState('login'); 
  const [activeTab, setActiveTab] = useState('matches'); 
  const [isAdmin, setIsAdmin] = useState(false); 
  const [adminPassword, setAdminPassword] = useState('admin');
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); 

  const [teams, setTeams] = useState([]);
  const [activeTeamId, setActiveTeamId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [viewDate, setViewDate] = useState(new Date());

  const [systemAlert, setSystemAlert] = useState({ isOpen: false, message: '' });
  const [systemConfirm, setSystemConfirm] = useState({ isOpen: false, message: '', onConfirm: null });

  const [authModal, setAuthModal] = useState({ isOpen: false, type: '', targetTeam: null }); 
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const [newTeamLogo, setNewTeamLogo] = useState(null);
  const [teamSettingsModal, setTeamSettingsModal] = useState(false);
  const [teamSettingsLogo, setTeamSettingsLogo] = useState(null); 
  
  const [isLoginAdminMode, setIsLoginAdminMode] = useState(false);
  const [editTeamModal, setEditTeamModal] = useState({ isOpen: false, team: null });
  const [editTeamLogo, setEditTeamLogo] = useState(null);
  const [adminPwdChangeModal, setAdminPwdChangeModal] = useState(false);

  const [matchModal, setMatchModal] = useState({ isOpen: false, match: null }); 
  const [matchTypeForm, setMatchTypeForm] = useState('internal'); 
  const [assignmentModal, setAssignmentModal] = useState({ isOpen: false, match: null }); 
  
  const [detailModal, setDetailModal] = useState({ isOpen: false, match: null }); 
  const [detailModalMatchId, setDetailModalMatchId] = useState(null); 
  
  const [rosterModal, setRosterModal] = useState({ isOpen: false, player: null });
  const [shareModal, setShareModal] = useState({ isOpen: false, step: 1, data: null, file: null, imgUrl: null, isVideo: false });

  const [liveMatchId, setLiveMatchId] = useState(null);
  const [liveState, setLiveState] = useState({ currentQuarter: 1, playingTeams: ['A', 'B'], isQuarterActive: false });
  
  const [goalFlow, setGoalFlow] = useState({ isOpen: false, step: 1, matchId: null, quarter: null, teamLetter: null, availableTeams: [], scorer: null, isPK: false, remark: '', isMissingAdd: false });
  const [logEditModal, setLogEditModal] = useState({ isOpen: false, match: null, log: null });

  // 전술 보드 관련 State
  const [pitchType, setPitchType] = useState('full'); 
  const [currentTool, setCurrentTool] = useState('move'); 
  const [tacticTokens, setTacticTokens] = useState(getInitialTacticsTokens('full'));
  const [drawings, setDrawings] = useState([]);
  const [activeDrawing, setActiveDrawing] = useState(null);
  const [pastState, setPastState] = useState([]);
  const [futureState, setFutureState] = useState([]);
  const [draggingToken, setDraggingToken] = useState(null);
  const [tokenEditModal, setTokenEditModal] = useState({ isOpen: false, token: null });
  
  // 애니메이션 관련 State
  const [animationFrames, setAnimationFrames] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAutoRecording, setIsAutoRecording] = useState(false); 
  const playbackRef = useRef(null);
  const boardRef = useRef(null);
  const pointerDownInfo = useRef({ x: 0, y: 0, time: 0 });
  const dragStartTokensRef = useRef(null);

  // ★ 빠른 그리기(Lag 제거)를 위한 직접 DOM 조작 Ref
  const svgArrowRef = useRef(null);
  const svgPassRef = useRef(null);
  const svgZoneRef = useRef(null);
  const activeDrawingData = useRef(null);

  const activeTeam = useMemo(() => teams.find(t => t.id === activeTeamId), [teams, activeTeamId]);
  const currentTeamPlayers = useMemo(() => players.filter(p => p.teamId === activeTeamId), [players, activeTeamId]);
  const currentTeamMatches = useMemo(() => matches.filter(m => m.teamId === activeTeamId), [matches, activeTeamId]);
  const liveMatch = useMemo(() => matches.find(m => m.id === liveMatchId), [matches, liveMatchId]);
  const detailMatch = useMemo(() => matches.find(m => m.id === detailModalMatchId), [matches, detailModalMatchId]);

  const viewYearMonth = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;
  const monthlyMatches = useMemo(() => currentTeamMatches.filter(m => m.date.startsWith(viewYearMonth)), [currentTeamMatches, viewYearMonth]);
  const scheduledThisMonth = useMemo(() => monthlyMatches.filter(m => m.status === 'scheduled').sort((a,b) => a.date.localeCompare(b.date)), [monthlyMatches]);
  
  const completedThisMonthWithStandings = useMemo(() => {
    return monthlyMatches.filter(m => m.status === 'completed').sort((a,b) => b.date.localeCompare(a.date)).map(m => ({ ...m, standings: calculateStandings(m) }));
  }, [monthlyMatches]);

  const matchesByDate = useMemo(() => {
    const map = {};
    monthlyMatches.forEach(m => { if (!map[m.date]) map[m.date] = []; map[m.date].push(m); });
    return map;
  }, [monthlyMatches]);

  const calculatedPlayersList = useMemo(() => {
    const stats = {};
    currentTeamPlayers.forEach(p => { stats[p.id] = { ...p, trueCaps: 0, trueGoals: 0, trueAssists: 0 }; });
    const completedMatches = currentTeamMatches.filter(m => m.status === 'completed');
    completedMatches.forEach(m => {
      (m.attendees || []).forEach(pid => { if (stats[pid]) stats[pid].trueCaps += 1; });
      (m.logs || []).forEach(log => {
        if (log.scorerId && stats[log.scorerId]) stats[log.scorerId].trueGoals += 1;
        if (log.assistId && stats[log.assistId]) stats[log.assistId].trueAssists += 1;
      });
    });
    return Object.values(stats).sort((a,b) => b.trueCaps !== a.trueCaps ? b.trueCaps - a.trueCaps : b.trueGoals - a.trueGoals);
  }, [currentTeamPlayers, currentTeamMatches]);

  const monthlyStats = useMemo(() => {
    const statsMap = {}; 
    currentTeamPlayers.forEach(p => { statsMap[p.id] = { id: p.id, name: p.name, caps: 0, goals: 0, assists: 0 }; });
    const completedMatches = monthlyMatches.filter(m => m.status === 'completed');
    completedMatches.forEach(m => {
      (m.attendees || []).forEach(pId => { if(statsMap[pId]) statsMap[pId].caps += 1; });
      (m.logs || []).forEach(log => {
        if (log.scorerId && statsMap[log.scorerId]) statsMap[log.scorerId].goals += 1;
        if (log.assistId && statsMap[log.assistId]) statsMap[log.assistId].assists += 1;
      });
    });
    return Object.values(statsMap).sort((a, b) => b.goals !== a.goals ? b.goals - a.goals : (b.assists !== a.assists ? b.assists - a.assists : b.caps - a.caps));
  }, [monthlyMatches, currentTeamPlayers]);

  const globalStyles = (
    <style>{`
      *::-webkit-scrollbar { display: none !important; width: 0 !important; }
      * { -ms-overflow-style: none !important; scrollbar-width: none !important; }
      input[type="number"]::-webkit-outer-spin-button, input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      input[type="number"] { -moz-appearance: textfield; }
      .will-change-transform { will-change: transform, left, top; }
    `}</style>
  );

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) setUser(currentUser);
      else signInAnonymously(auth).catch(err => console.error(err));
    });
    const unsubTeams = onSnapshot(collection(db, 'teams'), snap => {
      setTeams(snap.docs.map(d => d.data())); setIsLoaded(true); 
    });
    return () => { unsubscribeAuth(); unsubTeams(); };
  }, []);

  useEffect(() => {
    if (!activeTeamId) { setPlayers([]); setMatches([]); return; }
    const qPlayers = query(collection(db, 'players'), where('teamId', '==', activeTeamId));
    const unsubPlayers = onSnapshot(qPlayers, snap => setPlayers(snap.docs.map(d => d.data())));
    const qMatches = query(collection(db, 'matches'), where('teamId', '==', activeTeamId));
    const unsubMatches = onSnapshot(qMatches, snap => setMatches(snap.docs.map(d => d.data())));
    return () => { unsubPlayers(); unsubMatches(); };
  }, [activeTeamId]);

  useEffect(() => {
    return () => { if (playbackRef.current) clearTimeout(playbackRef.current); };
  }, []);

  const handleActionClick = (action, match) => {
    const safeDate = match.date.replace(/-/g, '/');
    const matchDateTime = new Date(`${safeDate} ${match.time}`);
    const now = new Date();
    if (!isAdmin) {
      if (matchDateTime > now) {
        setSystemAlert({ isOpen: true, message: `해당 기능은 경기 시작 전에는 이용할 수 없습니다.\n\n미리 기록 및 편성을 원하시면 우측 상단의\n[관리자 전환]을 이용해 주세요.` });
      } else {
        setSystemAlert({ isOpen: true, message: `해당 기능은 조회 모드에서는 이용할 수 없습니다.\n\n기록 및 편성을 원하시면 우측 상단의\n[관리자 전환]을 이용해 주세요.` });
      }
      return;
    }
    if (action === 'assign') setAssignmentModal({ isOpen: true, match });
    if (action === 'start') startLiveMatch(match);
  };

  const handleAuthSubmit = (e) => {
    e.preventDefault();
    const pwd = e.target.password.value;
    if (authModal.type === 'loginAdminAuth') {
      if (pwd === adminPassword) { setIsLoginAdminMode(true); setAuthModal({ isOpen: false }); } 
      else setSystemAlert({ isOpen: true, message: '시스템 관리자 비밀번호가 틀렸습니다.' });
    } else if (authModal.type === 'adminCreate') {
      if (pwd === adminPassword) { setAuthModal({ isOpen: false }); setIsCreateTeamOpen(true); } 
      else setSystemAlert({ isOpen: true, message: '시스템 관리자 비밀번호가 틀렸습니다.' });
    } else if (authModal.type === 'adminMode') {
      if (pwd === (activeTeam?.adminPassword || 'admin')) { setIsAdmin(true); setAuthModal({ isOpen: false }); } 
      else setSystemAlert({ isOpen: true, message: '팀 관리자 비밀번호가 틀렸습니다.' });
    } else if (authModal.type === 'teamLogin') {
      if (pwd === authModal.targetTeam.password) { setActiveTeamId(authModal.targetTeam.id); setIsAdmin(false); setAppState('main'); setAuthModal({ isOpen: false }); } 
      else setSystemAlert({ isOpen: true, message: '팀 비밀번호가 틀렸습니다.' });
    }
  };

  const logout = () => { setActiveTeamId(null); setIsAdmin(false); setAppState('login'); setAuthModal({ isOpen: false, type: '', targetTeam: null }); };

  const handleAdminPwdChange = (e) => { e.preventDefault(); setAdminPassword(e.target.newAdminPwd.value); setAdminPwdChangeModal(false); setSystemAlert({ isOpen: true, message: '마스터 비밀번호가 성공적으로 변경되었습니다.' }); };

  const handleCreateTeam = async (e) => {
    e.preventDefault(); if(isProcessing) return; setIsProcessing(true);
    try {
      const newTeamId = 't' + Date.now();
      const newTeam = { id: newTeamId, name: e.target.teamName.value, password: e.target.password.value, adminPassword: e.target.adminPassword.value, logo: newTeamLogo || '⚽' };
      await setDoc(doc(db, 'teams', newTeamId), newTeam);
      setIsCreateTeamOpen(false); setNewTeamLogo(null);
    } finally { setIsProcessing(false); }
  };

  const handleEditTeam = async (e) => {
    e.preventDefault(); if(isProcessing) return; setIsProcessing(true);
    try {
      const updatedTeam = { ...editTeamModal.team, name: e.target.teamName.value, password: e.target.password.value, adminPassword: e.target.adminPassword.value, logo: editTeamLogo || editTeamModal.team.logo };
      await setDoc(doc(db, 'teams', updatedTeam.id), updatedTeam);
      setEditTeamModal({ isOpen: false, team: null }); setSystemAlert({ isOpen: true, message: '팀 정보가 수정되었습니다.' });
    } finally { setIsProcessing(false); }
  };

  const requestDeleteTeam = (id) => { setSystemConfirm({ isOpen: true, message: '정말 이 팀을 삭제하시겠습니까? 관련 일정이 모두 삭제됩니다.', onConfirm: async () => { if(isProcessing) return; setIsProcessing(true); await deleteDoc(doc(db, 'teams', id)); setIsProcessing(false); } }); };

  const handleTeamSettingsSave = async (e) => {
    e.preventDefault(); if(isProcessing) return; setIsProcessing(true);
    try {
      const fd = new FormData(e.target);
      const updatedTeam = { ...activeTeam, name: fd.get('name'), password: fd.get('password'), adminPassword: fd.get('teamAdminPassword'), logo: teamSettingsLogo || activeTeam.logo };
      await setDoc(doc(db, 'teams', activeTeamId), updatedTeam);
      setTeamSettingsModal(false); setSystemAlert({isOpen: true, message: '팀 설정이 성공적으로 저장되었습니다.'});
    } finally { setIsProcessing(false); }
  };

  const saveMatch = async (e) => {
    e.preventDefault(); if(isProcessing) return; setIsProcessing(true);
    try {
      const fd = new FormData(e.target);
      const attendees = currentTeamPlayers.filter(p => fd.get(`attendee_${p.id}`)).map(p => p.id);
      const matchType = matchTypeForm;
      const opponentName = matchType === 'external' ? fd.get('opponentName') : '';
      const teamCount = matchType === 'external' ? 2 : parseInt(fd.get('teamCount'));
      const newAssignments = { ...(matchModal.match?.teamAssignments || {}) };
      attendees.forEach(pId => { if (matchType === 'external') newAssignments[pId] = 'A'; });

      const matchId = matchModal.match?.id || 'm' + Date.now().toString();
      if (matchModal.match?.status === 'completed') {
        const oldAttendees = matchModal.match.attendees || [];
        const added = attendees.filter(id => !oldAttendees.includes(id));
        const removed = oldAttendees.filter(id => !attendees.includes(id));
        const updatePromises = [];
        for (const id of added) { const p = players.find(x => x.id === id); if (p) updatePromises.push(setDoc(doc(db, 'players', id), { ...p, caps: (p.caps || 0) + 1 })); }
        for (const id of removed) { const p = players.find(x => x.id === id); if (p) updatePromises.push(setDoc(doc(db, 'players', id), { ...p, caps: Math.max(0, (p.caps || 0) - 1) })); }
        if (updatePromises.length > 0) await Promise.all(updatePromises);
      }

      const newMatch = { ...matchModal.match, id: matchId, teamId: activeTeamId, date: fd.get('date'), time: fd.get('time'), location: fd.get('location'), matchType, opponentName, teamCount, totalQuarters: parseInt(fd.get('totalQuarters')), attendees, teamAssignments: newAssignments, scores: matchModal.match?.scores || { A: 0, B: 0, C: 0, D: 0 }, quarterScores: matchModal.match?.quarterScores || [], logs: matchModal.match?.logs || [], status: matchModal.match?.status || 'scheduled' };
      await setDoc(doc(db, 'matches', matchId), newMatch);
      setMatchModal({ isOpen: false, match: null });
    } finally { setIsProcessing(false); }
  };

  const requestDeleteMatch = (id) => { setSystemConfirm({ isOpen: true, message: '정말 삭제하시겠습니까?', onConfirm: async () => { if(isProcessing) return; setIsProcessing(true); await deleteDoc(doc(db, 'matches', id)); setMatchModal({ isOpen: false, match: null }); setIsProcessing(false); } }); };

  const saveRoster = async (e) => {
    e.preventDefault(); if(isProcessing) return; setIsProcessing(true);
    try {
      const fd = new FormData(e.target);
      const playerId = rosterModal.player?.id || 'p' + Date.now();
      const newPlayer = { ...rosterModal.player, id: playerId, teamId: activeTeamId, name: fd.get('name'), birthYear: parseInt(fd.get('birthYear')), goals: rosterModal.player?.goals || 0, assists: rosterModal.player?.assists || 0, caps: rosterModal.player?.caps || 0 };
      await setDoc(doc(db, 'players', playerId), newPlayer);
      setRosterModal({ isOpen: false, player: null });
    } finally { setIsProcessing(false); }
  };

  const requestDeleteRoster = (id) => { setSystemConfirm({ isOpen: true, message: '명단에서 삭제하시겠습니까?', onConfirm: async () => { if(isProcessing) return; setIsProcessing(true); await deleteDoc(doc(db, 'players', id)); setRosterModal({ isOpen: false, player: null }); setIsProcessing(false); } }); };

  const requestResetStats = () => {
    setSystemConfirm({
      isOpen: true, message: '🚨 정말 모든 선수의 누적 스탯(참석, 득점, 도움)을 0으로 초기화하시겠습니까?\n\n※ 이 작업은 되돌릴 수 없습니다.',
      onConfirm: async () => {
        if(isProcessing) return; setIsProcessing(true);
        try {
          const updatePromises = currentTeamPlayers.map(p => setDoc(doc(db, 'players', p.id), { ...p, caps: 0, goals: 0, assists: 0 }));
          await Promise.all(updatePromises);
          setSystemAlert({ isOpen: true, message: '모든 스탯이 성공적으로 초기화되었습니다.' });
        } catch(err) { setSystemAlert({ isOpen: true, message: '오류가 발생했습니다.' }); } finally { setIsProcessing(false); }
      }
    });
  };

  const assignTeam = (playerId, teamLetter) => {
    const m = assignmentModal.match;
    if(m) {
      const currentTeam = m.teamAssignments?.[playerId] || null;
      if (currentTeam === teamLetter) return;
      const newAssigns = { ...m.teamAssignments, [playerId]: teamLetter };
      const updatedMatch = { ...m, teamAssignments: newAssigns };
      setAssignmentModal(prev => ({ ...prev, match: updatedMatch }));
      setDoc(doc(db, 'matches', m.id), updatedMatch).catch(console.error);
    }
  };

  const startLiveMatch = (match) => {
    const qScores = match.quarterScores || [];
    const mLogs = match.logs || [];
    const currentQ = qScores.length + 1;
    const currentLogs = mLogs.filter(l => l.quarter === currentQ);
    let playingTeams = ['A', 'B']; let isQuarterActive = false;
    if (match.matchType === 'external') { playingTeams = ['A', 'B']; if (currentLogs.length > 0) isQuarterActive = true; } 
    else {
       if (currentLogs.length > 0) {
          const teamsInLogs = [...new Set(currentLogs.map(l => l.teamLetter))];
          if (teamsInLogs.length === 2) playingTeams = teamsInLogs; else if (teamsInLogs.length === 1) playingTeams = [teamsInLogs[0], TEAM_LETTERS.find(t => t !== teamsInLogs[0])];
          isQuarterActive = true;
       }
    }
    setLiveMatchId(match.id); setLiveState({ currentQuarter: currentQ, playingTeams: playingTeams, isQuarterActive: isQuarterActive }); setAppState('liveMatch');
  };

  const handleOpponentGoalSubmit = async () => {
    if(isProcessing) return; setIsProcessing(true);
    const gfMatchId = goalFlow.matchId; const gfQuarter = goalFlow.quarter; const gfIsPK = goalFlow.isPK; const gfRemark = goalFlow.remark; const gfIsMissingAdd = goalFlow.isMissingAdd;
    setGoalFlow({ isOpen: false, step: 1, matchId: null, quarter: null, teamLetter: null, scorer: null, isPK: false, remark: '', isMissingAdd: false });
    try {
      const targetMatchId = gfMatchId || liveMatchId; const targetMatch = matches.find(m => m.id === targetMatchId); const quarter = gfQuarter || liveState.currentQuarter;
      const newLog = { id: Date.now(), quarter: quarter, teamLetter: 'B', scorerId: null, scorerName: targetMatch.opponentName || '상대팀', assistId: null, assistName: null, time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute:'2-digit' }), isPK: gfIsPK || false, remark: gfRemark || '' };
      const newLogs = [...(targetMatch.logs || []), newLog];
      const newScores = { ...(targetMatch.scores || {}), 'B': ((targetMatch.scores || {})['B'] || 0) + 1 };
      let newQuarterScores = [...(targetMatch.quarterScores || [])];
      if (gfIsMissingAdd) {
         const qsIndex = newQuarterScores.findIndex(qs => qs.quarter === quarter);
         if (qsIndex > -1) { const qs = newQuarterScores[qsIndex]; newQuarterScores[qsIndex] = { ...qs, score2: qs.score2 + 1 }; }
      }
      const updatedMatch = { ...targetMatch, scores: newScores, logs: newLogs, quarterScores: newQuarterScores };
      await setDoc(doc(db, 'matches', targetMatchId), updatedMatch);
    } finally { setIsProcessing(false); }
  };

  const handleOwnGoalSubmit = async (targetTeamLetter, isOurFault = false) => {
    if(isProcessing) return; setIsProcessing(true);
    const gfMatchId = goalFlow.matchId; const gfQuarter = goalFlow.quarter; const gfRemark = goalFlow.remark; const gfIsMissingAdd = goalFlow.isMissingAdd;
    setGoalFlow({ isOpen: false, step: 1, matchId: null, quarter: null, teamLetter: null, scorer: null, isPK: false, remark: '', isMissingAdd: false });
    try {
      const targetMatchId = gfMatchId || liveMatchId; const targetMatch = matches.find(m => m.id === targetMatchId); const quarter = gfQuarter || liveState.currentQuarter;
      const scorerName = isOurFault ? '우리팀 자책골' : '상대팀 자책골';
      const newLog = { id: Date.now(), quarter: quarter, teamLetter: targetTeamLetter, scorerId: null, scorerName: scorerName, assistId: null, assistName: null, time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute:'2-digit' }), isPK: false, remark: gfRemark || '' };
      const newLogs = [...(targetMatch.logs || []), newLog];
      const newScores = { ...(targetMatch.scores || {}), [targetTeamLetter]: ((targetMatch.scores || {})[targetTeamLetter] || 0) + 1 };
      let newQuarterScores = [...(targetMatch.quarterScores || [])];
      if (gfIsMissingAdd) {
         const qsIndex = newQuarterScores.findIndex(qs => qs.quarter === quarter);
         if (qsIndex > -1) {
            const qs = newQuarterScores[qsIndex]; const isTeam1 = qs.team1 === targetTeamLetter;
            newQuarterScores[qsIndex] = { ...qs, score1: isTeam1 ? qs.score1 + 1 : qs.score1, score2: !isTeam1 ? qs.score2 + 1 : qs.score2 };
         }
      }
      const updatedMatch = { ...targetMatch, scores: newScores, logs: newLogs, quarterScores: newQuarterScores };
      await setDoc(doc(db, 'matches', targetMatchId), updatedMatch);
    } finally { setIsProcessing(false); }
  };

  const handleGoalSubmit = async (playerId, teamLetter) => {
    if (goalFlow.step === 1) { setGoalFlow({ ...goalFlow, step: 2, teamLetter, scorer: playerId }); } else {
      if(isProcessing) return; setIsProcessing(true);
      const gfMatchId = goalFlow.matchId; const gfQuarter = goalFlow.quarter; const gfTeamLetter = goalFlow.teamLetter; const gfScorer = goalFlow.scorer; const gfIsPK = goalFlow.isPK; const gfRemark = goalFlow.remark; const gfIsMissingAdd = goalFlow.isMissingAdd;
      setGoalFlow({ isOpen: false, step: 1, matchId: null, quarter: null, teamLetter: null, scorer: null, isPK: false, remark: '', isMissingAdd: false });
      try {
        const targetMatchId = gfMatchId || liveMatchId; const targetMatch = matches.find(m => m.id === targetMatchId); const quarter = gfQuarter || liveState.currentQuarter; const assistId = playerId;
        const newLog = { id: Date.now(), quarter: quarter, teamLetter: gfTeamLetter, scorerId: gfScorer, scorerName: players.find(p=>p.id===gfScorer)?.name, assistId: assistId, assistName: assistId ? players.find(p=>p.id===assistId)?.name : null, time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute:'2-digit' }), isPK: gfIsPK || false, remark: gfRemark || '' };
        const newLogs = [...(targetMatch.logs || []), newLog];
        const newScores = { ...(targetMatch.scores || {}), [gfTeamLetter]: ((targetMatch.scores || {})[gfTeamLetter] || 0) + 1 };
        let newQuarterScores = [...(targetMatch.quarterScores || [])];
        if (gfIsMissingAdd) {
           const qsIndex = newQuarterScores.findIndex(qs => qs.quarter === quarter);
           if (qsIndex > -1) {
              const qs = newQuarterScores[qsIndex]; const isTeam1 = qs.team1 === gfTeamLetter;
              newQuarterScores[qsIndex] = { ...qs, score1: isTeam1 ? qs.score1 + 1 : qs.score1, score2: !isTeam1 ? qs.score2 + 1 : qs.score2 };
           }
        }
        const updatedMatch = { ...targetMatch, scores: newScores, logs: newLogs, quarterScores: newQuarterScores };
        const updatePromises = [setDoc(doc(db, 'matches', targetMatchId), updatedMatch)];
        const scorer = players.find(p => p.id === gfScorer);
        if (scorer) updatePromises.push(setDoc(doc(db, 'players', scorer.id), { ...scorer, goals: (scorer.goals || 0) + 1 }));
        if (assistId) { const assist = players.find(p => p.id === assistId); if (assist) updatePromises.push(setDoc(doc(db, 'players', assist.id), { ...assist, assists: (assist.assists || 0) + 1 })); }
        await Promise.all(updatePromises);
      } finally { setIsProcessing(false); }
    }
  };

  const openLogEditModal = (log, match) => {
    if (!isAdmin) { setSystemAlert({isOpen: true, message: '기록 수정은 팀 관리자만 가능합니다.'}); return; }
    const enrichedLog = { ...log };
    if (!enrichedLog.scorerId && enrichedLog.scorerName) enrichedLog.scorerId = players.find(p => p.name === enrichedLog.scorerName)?.id;
    if (!enrichedLog.assistId && enrichedLog.assistName) enrichedLog.assistId = players.find(p => p.name === enrichedLog.assistName)?.id;
    setLogEditModal({ isOpen: true, match, log: enrichedLog });
  };

  const handleLogEditSave = async (e) => {
    e.preventDefault(); if(isProcessing) return; setIsProcessing(true);
    try {
      const fd = new FormData(e.target); const newScorerId = fd.get('scorerId') || null; const newAssistId = fd.get('assistId'); const newIsPK = fd.get('isPK') === 'true'; const newRemark = fd.get('remark') || '';
      const m = matches.find(match => match.id === logEditModal.match.id); const l = logEditModal.log;
      const oldScorerId = l.scorerId; const oldAssistId = l.assistId; const updatePromises = [];

      if (oldScorerId !== newScorerId) {
          if (oldScorerId) { const p = players.find(p => p.id === oldScorerId); if (p) updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, goals: Math.max(0, (p.goals || 0) - 1) })); }
          if (newScorerId) { const p = players.find(p => p.id === newScorerId); if (p) updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, goals: (p.goals || 0) + 1 })); }
      }
      if (oldAssistId !== newAssistId) {
          if (oldAssistId) { const p = players.find(p => p.id === oldAssistId); if (p) updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, assists: Math.max(0, (p.assists || 0) - 1) })); }
          if (newAssistId && newAssistId !== 'none') { const p = players.find(p => p.id === newAssistId); if (p) updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, assists: (p.assists || 0) + 1 })); }
      }
      const finalAssistId = newAssistId === 'none' ? null : newAssistId;
      const finalAssistName = finalAssistId ? players.find(p => p.id === finalAssistId)?.name : null;

      const updatedLogs = (m.logs || []).map(log => {
          if (log.id === l.id) { return { ...log, scorerId: newScorerId, scorerName: newScorerId ? (players.find(p => p.id === newScorerId)?.name || log.scorerName) : log.scorerName, assistId: finalAssistId, assistName: finalAssistName, isPK: newIsPK, remark: newRemark }; }
          return log;
      });
      updatePromises.push(setDoc(doc(db, 'matches', m.id), { ...m, logs: updatedLogs }));
      await Promise.all(updatePromises);
      setLogEditModal({ isOpen: false, match: null, log: null });
      setSystemAlert({ isOpen: true, message: '득점 기록이 수정되었습니다.' });
    } finally { setIsProcessing(false); }
  };

  const handleLogDelete = async () => {
    const m = matches.find(match => match.id === logEditModal.match.id); const l = logEditModal.log;
    setSystemConfirm({ isOpen: true, message: '정말 이 득점 기록을 삭제하시겠습니까?\n(선수 개인 기록과 팀 점수도 함께 차감됩니다.)', onConfirm: async () => {
            if(isProcessing) return; setIsProcessing(true);
            try {
              const updatePromises = [];
              if (l.scorerId) { const p = players.find(p => p.id === l.scorerId); if (p) updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, goals: Math.max(0, (p.goals || 0) - 1) })); }
              if (l.assistId) { const p = players.find(p => p.id === l.assistId); if (p) updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, assists: Math.max(0, (p.assists || 0) - 1) })); }
              const updatedLogs = (m.logs || []).filter(log => log.id !== l.id);
              let updatedQuarterScores = [...(m.quarterScores || [])];
              const qsIndex = updatedQuarterScores.findIndex(qs => qs.quarter === l.quarter);
              if (qsIndex > -1) {
                  const qs = updatedQuarterScores[qsIndex]; const isTeam1 = qs.team1 === l.teamLetter;
                  updatedQuarterScores[qsIndex] = { ...qs, score1: isTeam1 ? Math.max(0, qs.score1 - 1) : qs.score1, score2: !isTeam1 ? Math.max(0, qs.score2 - 1) : qs.score2 };
              }
              const updatedScores = { ...(m.scores || {}) };
              if (updatedScores[l.teamLetter] !== undefined) updatedScores[l.teamLetter] = Math.max(0, updatedScores[l.teamLetter] - 1);
              updatePromises.push(setDoc(doc(db, 'matches', m.id), { ...m, logs: updatedLogs, scores: updatedScores, quarterScores: updatedQuarterScores }));
              await Promise.all(updatePromises);
              setLogEditModal({ isOpen: false, match: null, log: null }); setSystemAlert({ isOpen: true, message: '득점 기록이 삭제되었습니다.' });
            } finally { setIsProcessing(false); }
        } });
  };

  const requestEndQuarter = () => { setSystemConfirm({ isOpen: true, message: '현재 쿼터를 종료하시겠습니까?', onConfirm: () => endQuarter() }); };

  const endQuarter = async () => {
    if(isProcessing) return; setIsProcessing(true);
    try {
      const [t1, t2] = liveState.playingTeams;
      const mLogs = liveMatch.logs || [];
      const qScore1 = mLogs.filter(l => l.quarter === liveState.currentQuarter && l.teamLetter === t1).length;
      const qScore2 = mLogs.filter(l => l.quarter === liveState.currentQuarter && l.teamLetter === t2).length;
      const newQuarterScore = { quarter: liveState.currentQuarter, team1: t1, team2: t2, score1: qScore1, score2: qScore2 };
      const updatedMatch = { ...liveMatch, quarterScores: [...(liveMatch.quarterScores || []), newQuarterScore] };
          
      if (liveState.currentQuarter >= liveMatch.totalQuarters) {
         const updatePromises = [];
         for (const p of players) { if ((updatedMatch.attendees || []).includes(p.id)) { updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, caps: (p.caps || 0) + 1 })); } }
         updatePromises.push(setDoc(doc(db, 'matches', liveMatchId), { ...updatedMatch, status: 'completed' }));
         await Promise.all(updatePromises);
         setAppState('main'); setLiveMatchId(null);
      } else {
         await setDoc(doc(db, 'matches', liveMatchId), updatedMatch);
         setLiveState(prev => ({ currentQuarter: prev.currentQuarter + 1, playingTeams: ['A', 'B'], isQuarterActive: false }));
      }
    } catch (err) { setSystemAlert({ isOpen: true, message: '오류가 발생했습니다.' }); } finally { setIsProcessing(false); }
  };

  const triggerShare = (data) => {
    setShareModal({ isOpen: true, step: 1, data, file: null, imgUrl: null, isVideo: false });
    setTimeout(async () => {
      const captureTarget = document.getElementById('capture-area-hidden');
      if (!captureTarget) return;
      try {
        const html2canvas = await loadHtml2Canvas();
        const canvas = await html2canvas(captureTarget, { scale: 2, useCORS: true, backgroundColor: '#0F172A' });
        canvas.toBlob((blob) => {
          if (!blob) return;
          const file = new File([blob], 'matchboard_result.png', { type: 'image/png' });
          const imgUrl = URL.createObjectURL(blob);
          setShareModal(prev => ({ ...prev, step: 2, file, imgUrl, isVideo: false }));
        }, 'image/png');
      } catch (err) { setSystemAlert({ isOpen: true, message: '오류가 발생했습니다.' }); setShareModal({ isOpen: false, step: 1, data: null, file: null, imgUrl: null, isVideo: false }); }
    }, 500); 
  };

  const triggerTacticShare = () => {
    if (!boardRef.current) return;
    setShareModal({ isOpen: true, step: 1, data: null, file: null, imgUrl: null, isVideo: false });
    setTimeout(async () => {
      try {
        const html2canvas = await loadHtml2Canvas();
        const canvas = await html2canvas(boardRef.current, { scale: 2, useCORS: true, backgroundColor: '#047857' });
        canvas.toBlob((blob) => {
          if (!blob) return;
          const file = new File([blob], 'matchboard_tactic.png', { type: 'image/png' });
          const imgUrl = URL.createObjectURL(blob);
          setShareModal(prev => ({ ...prev, step: 2, file, imgUrl, isVideo: false }));
        }, 'image/png');
      } catch (err) { setSystemAlert({ isOpen: true, message: '오류가 발생했습니다.' }); setShareModal({ isOpen: false, step: 1, data: null, file: null, imgUrl: null, isVideo: false }); }
    }, 500); 
  };

  const downloadFallback = (file, url) => {
    const a = document.createElement('a'); a.href = url; a.download = file.name; a.click();
    setSystemAlert({ isOpen: true, message: '파일이 기기에 다운로드 되었습니다.' });
  }

  const doActualShare = async () => {
    const file = shareModal.file; if (!file) return;
    const isKakaotalk = navigator.userAgent.toLowerCase().includes('kakaotalk');
    if (isKakaotalk) {
      setSystemAlert({ isOpen: true, message: '🚨 카카오톡 브라우저에서는 자동 공유/복사가 제한됩니다.\n\n💡 해결 방법:\n1. 화면의 이미지를 길게 눌러 저장하시거나\n2. 우측 하단 ⠇ 메뉴를 눌러 "다른 브라우저로 열기(Safari/Chrome)"를 선택해주세요!' });
      return;
    }
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ title: 'MATCHBOARD', files: [file] }); } catch (error) { if (error.name !== 'AbortError') downloadFallback(file, shareModal.imgUrl); }
    } else {
      if (!shareModal.isVideo && navigator.clipboard && window.isSecureContext) {
        try {
          const clipboardItem = new ClipboardItem({ [file.type]: file });
          await navigator.clipboard.write([clipboardItem]);
          setSystemAlert({ isOpen: true, message: '클립보드에 복사되었습니다!\n원하는 곳에 붙여넣기 해주세요.' });
        } catch(e) { downloadFallback(file, shareModal.imgUrl); }
      } else { downloadFallback(file, shareModal.imgUrl); }
    }
  };

  const saveHistory = (newTokens, newDrawings = drawings) => {
    setPastState(prev => [...prev, { tokens: tacticTokens, drawings }].slice(-20)); 
    setFutureState([]);
    setTacticTokens(newTokens);
    if(newDrawings) setDrawings(newDrawings);
    if (isAutoRecording) setAnimationFrames(prev => [...prev, { tokens: JSON.parse(JSON.stringify(newTokens)), drawings: JSON.parse(JSON.stringify(newDrawings)) }]);
  };

  const handleUndo = () => {
    if (pastState.length === 0) return;
    const previous = pastState[pastState.length - 1];
    setPastState(prev => prev.slice(0, -1));
    setFutureState(prev => [{ tokens: tacticTokens, drawings }, ...prev]);
    setTacticTokens(previous.tokens); setDrawings(previous.drawings);
  };

  const handleRedo = () => {
    if (futureState.length === 0) return;
    const next = futureState[0];
    setFutureState(prev => prev.slice(1));
    setPastState(prev => [...prev, { tokens: tacticTokens, drawings }]);
    setTacticTokens(next.tokens); setDrawings(next.drawings);
  };

  const handleUpdatePlayerCount = (teamLetter, newCount) => {
    if (newCount < 0) newCount = 0; if (newCount > 30) newCount = 30;
    const teamTokens = tacticTokens.filter(t => t.team === teamLetter);
    const otherTokens = tacticTokens.filter(t => t.team !== teamLetter);
    const currentCount = teamTokens.length;
    if (newCount === currentCount) return;

    let newTeamTokens = [...teamTokens];
    if (newCount > currentCount) {
      const toAdd = newCount - currentCount;
      for (let i = 0; i < toAdd; i++) {
        const newId = `${teamLetter}_${Date.now()}_${i}`;
        const yPos = pitchType === 'full' ? (teamLetter === 'A' ? 80 : 20) : (teamLetter === 'A' ? 65 : 35);
        newTeamTokens.push({ id: newId, position: 'CM', name: '', x: 50, y: yPos, team: teamLetter });
      }
    } else {
      const toRemove = currentCount - newCount;
      newTeamTokens.splice(newTeamTokens.length - toRemove, toRemove);
    }
    saveHistory([...otherTokens, ...newTeamTokens]);
  };

  const handleTokenPointerDown = (e, token) => {
    if (currentTool !== 'move' || isPlaying) return;
    e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
    pointerDownInfo.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    dragStartTokensRef.current = [...tacticTokens];
    setDraggingToken(token.id);
  };

  const handleBoardPointerDown = (e) => {
    if (currentTool === 'move' || isPlaying) return;
    const rect = boardRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100; const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (currentTool === 'arrow' || currentTool === 'pass' || currentTool === 'zone') {
       if (currentTool === 'arrow' && svgArrowRef.current) { svgArrowRef.current.style.display = 'block'; svgArrowRef.current.setAttribute('x1', `${x}%`); svgArrowRef.current.setAttribute('y1', `${y}%`); svgArrowRef.current.setAttribute('x2', `${x}%`); svgArrowRef.current.setAttribute('y2', `${y}%`); }
       if (currentTool === 'pass' && svgPassRef.current) { svgPassRef.current.style.display = 'block'; svgPassRef.current.setAttribute('x1', `${x}%`); svgPassRef.current.setAttribute('y1', `${y}%`); svgPassRef.current.setAttribute('x2', `${x}%`); svgPassRef.current.setAttribute('y2', `${y}%`); }
       if (currentTool === 'zone' && svgZoneRef.current) { svgZoneRef.current.style.display = 'block'; svgZoneRef.current.setAttribute('x', `${x}%`); svgZoneRef.current.setAttribute('y', `${y}%`); svgZoneRef.current.setAttribute('width', `0%`); svgZoneRef.current.setAttribute('height', `0%`); }
       activeDrawingData.current = { id: Date.now(), type: currentTool, start: {x, y}, end: {x, y} };
    }
  };

  const handleBoardPointerMove = (e) => {
    if (!boardRef.current || isPlaying) return;
    const rect = boardRef.current.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * 100; let y = ((e.clientY - rect.top) / rect.height) * 100;
    x = Math.max(0, Math.min(100, x)); y = Math.max(0, Math.min(100, y));

    if (currentTool === 'move' && draggingToken) {
      setTacticTokens(prev => prev.map(t => t.id === draggingToken ? { ...t, x, y } : t));
    } else if (activeDrawingData.current) {
      activeDrawingData.current.end = {x, y};
      if (activeDrawingData.current.type === 'arrow' && svgArrowRef.current) { svgArrowRef.current.setAttribute('x2', `${x}%`); svgArrowRef.current.setAttribute('y2', `${y}%`); }
      if (activeDrawingData.current.type === 'pass' && svgPassRef.current) { svgPassRef.current.setAttribute('x2', `${x}%`); svgPassRef.current.setAttribute('y2', `${y}%`); }
      if (activeDrawingData.current.type === 'zone' && svgZoneRef.current) {
         const sx = activeDrawingData.current.start.x; const sy = activeDrawingData.current.start.y;
         svgZoneRef.current.setAttribute('x', `${Math.min(sx, x)}%`); svgZoneRef.current.setAttribute('y', `${Math.min(sy, y)}%`);
         svgZoneRef.current.setAttribute('width', `${Math.abs(sx - x)}%`); svgZoneRef.current.setAttribute('height', `${Math.abs(sy - y)}%`);
      }
    }
  };

  const handleBoardPointerUp = (e) => {
    if (isPlaying) return;
    if (currentTool === 'move' && draggingToken) {
      const downInfo = pointerDownInfo.current;
      const dist = Math.sqrt(Math.pow(e.clientX - downInfo.x, 2) + Math.pow(e.clientY - downInfo.y, 2));
      if (dist < 5 && (Date.now() - downInfo.time) < 250) {
         if (draggingToken !== 'ball') setTokenEditModal({ isOpen: true, token: tacticTokens.find(t => t.id === draggingToken) });
         setTacticTokens(dragStartTokensRef.current);
      } else { saveHistory(tacticTokens); }
      setDraggingToken(null);
    } else if (activeDrawingData.current) {
      const dist = Math.sqrt(Math.pow(activeDrawingData.current.start.x - activeDrawingData.current.end.x, 2) + Math.pow(activeDrawingData.current.start.y - activeDrawingData.current.end.y, 2));
      if (dist > 2) { const newDrawings = [...drawings, activeDrawingData.current]; saveHistory(tacticTokens, newDrawings); }
      activeDrawingData.current = null;
      if (svgArrowRef.current) svgArrowRef.current.style.display = 'none';
      if (svgPassRef.current) svgPassRef.current.style.display = 'none';
      if (svgZoneRef.current) svgZoneRef.current.style.display = 'none';
    }
  };

  const handleEraseDrawing = (e, id) => {
    if (currentTool !== 'erase' || isPlaying) return; e.stopPropagation();
    const newDrawings = drawings.filter(d => d.id !== id); saveHistory(tacticTokens, newDrawings);
  };

  const handleTokenEditSave = (e) => {
    e.preventDefault(); const fd = new FormData(e.target); const pos = fd.get('position'); const name = fd.get('name');
    const newTokens = tacticTokens.map(t => t.id === tokenEditModal.token.id ? { ...t, position: pos, name: name } : t);
    saveHistory(newTokens); setTokenEditModal({ isOpen: false, token: null });
  };

  const handleTokenDelete = () => {
    const newTokens = tacticTokens.filter(t => t.id !== tokenEditModal.token.id);
    saveHistory(newTokens); setTokenEditModal({ isOpen: false, token: null });
  };

  const toggleAutoRecord = () => {
    if (!isAutoRecording) {
      setAnimationFrames([{ tokens: JSON.parse(JSON.stringify(tacticTokens)), drawings: JSON.parse(JSON.stringify(drawings)) }]);
      setIsAutoRecording(true);
    } else { setIsAutoRecording(false); }
  };

  const captureFrame = () => {
    const newFrames = [...animationFrames, { tokens: JSON.parse(JSON.stringify(tacticTokens)), drawings: JSON.parse(JSON.stringify(drawings)) }];
    setAnimationFrames(newFrames);
  };

  const clearFrames = () => { setAnimationFrames([]); setIsPlaying(false); setIsAutoRecording(false); if (playbackRef.current) clearTimeout(playbackRef.current); };

  const playAnimation = () => {
    if (animationFrames.length < 2) { setSystemAlert({ isOpen: true, message: '최소 2장면이 필요합니다.' }); return; }
    setIsPlaying(true); let currentFrameIdx = 0; let startTime = null; const transitionDuration = 800; 

    setTacticTokens(animationFrames[0].tokens);
    setDrawings(animationFrames[0].drawings);

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      let progress = (timestamp - startTime) / transitionDuration;
      if (progress > 1) progress = 1;

      const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
      const startTokens = animationFrames[currentFrameIdx].tokens;
      const endTokens = animationFrames[currentFrameIdx + 1].tokens;

      startTokens.forEach(t1 => {
        const t2 = endTokens.find(t => t.id === t1.id) || t1;
        const currentX = t1.x + (t2.x - t1.x) * ease;
        const currentY = t1.y + (t2.y - t1.y) * ease;
        const el = document.getElementById(`token-${t1.id}`);
        if (el) { el.style.left = `${currentX}%`; el.style.top = `${currentY}%`; }
      });

      if (progress < 1) {
        playbackRef.current = requestAnimationFrame(animate);
      } else {
        currentFrameIdx++;
        setTacticTokens(animationFrames[currentFrameIdx].tokens);
        setDrawings(animationFrames[currentFrameIdx].drawings);
        if (currentFrameIdx >= animationFrames.length - 1) { setIsPlaying(false); } 
        else { startTime = null; playbackRef.current = setTimeout(() => { playbackRef.current = requestAnimationFrame(animate); }, 300); }
      }
    };
    playbackRef.current = setTimeout(() => { playbackRef.current = requestAnimationFrame(animate); }, 300);
  };

  const exportAnimationToVideo = async () => {
    if (animationFrames.length < 2) return;
    setShareModal({ isOpen: true, step: 1, data: null, file: null, imgUrl: null, isVideo: true });

    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = pitchType === 'full' ? 900 : 800;
    const ctx = canvas.getContext('2d');
    const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
    const stream = canvas.captureStream(30); 
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    
    recorder.onstop = () => {
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(chunks, { type: mimeType });
        const file = new File([blob], `tactic_animation.${ext}`, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setShareModal(prev => ({ ...prev, step: 2, file, imgUrl: url, isVideo: true }));
    };
    recorder.start();
    let frameIdx = 0; let progress = 0; const fps = 30; const stepsPerFrame = fps * 1.0; 
    
    const draw = () => {
        ctx.fillStyle = '#047857'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(0, canvas.height/2); ctx.lineTo(canvas.width, canvas.height/2); ctx.stroke();
        ctx.beginPath(); ctx.arc(canvas.width/2, canvas.height/2, 60, 0, Math.PI*2); ctx.stroke();

        const currentFrame = animationFrames[frameIdx];
        const nextFrame = animationFrames[Math.min(frameIdx + 1, animationFrames.length - 1)];
        
        currentFrame.drawings.forEach(d => {
            if(d.type === 'arrow' || d.type === 'pass') {
               ctx.strokeStyle = d.type === 'arrow' ? '#FACC15' : '#60A5FA'; ctx.lineWidth = 5;
               if(d.type==='pass') ctx.setLineDash([12, 12]); else ctx.setLineDash([]);
               ctx.beginPath(); ctx.moveTo((d.start.x/100)*canvas.width, (d.start.y/100)*canvas.height); ctx.lineTo((d.end.x/100)*canvas.width, (d.end.y/100)*canvas.height); ctx.stroke(); ctx.setLineDash([]);
            } else if(d.type === 'zone') {
               ctx.fillStyle = 'rgba(59, 130, 246, 0.3)'; ctx.strokeStyle = '#3B82F6'; ctx.lineWidth = 3;
               const x = Math.min(d.start.x, d.end.x)/100 * canvas.width; const y = Math.min(d.start.y, d.end.y)/100 * canvas.height;
               const w = Math.abs(d.start.x - d.end.x)/100 * canvas.width; const h = Math.abs(d.start.y - d.end.y)/100 * canvas.height;
               ctx.fillRect(x,y,w,h); ctx.strokeRect(x,y,w,h);
            }
        });

        currentFrame.tokens.forEach(t1 => {
            const t2 = nextFrame.tokens.find(t => t.id === t1.id) || t1;
            const t = progress / stepsPerFrame;
            const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            const x = t1.x + (t2.x - t1.x) * ease; const y = t1.y + (t2.y - t1.y) * ease;
            const px = (x / 100) * canvas.width; const py = (y / 100) * canvas.height;

            if(t1.team === 'ball') {
                ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#000000'; ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⚽', px, py);
            } else {
                ctx.fillStyle = t1.team === 'A' ? '#DC2626' : '#2563EB'; ctx.beginPath(); ctx.arc(px, py, 22, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle = t1.team === 'A' ? '#991B1B' : '#1E40AF'; ctx.lineWidth = 3; ctx.stroke();
                
                ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t1.position || '', px, py);

                if (t1.name) {
                  ctx.font = 'bold 12px sans-serif';
                  const textWidth = ctx.measureText(t1.name).width; const rectWidth = textWidth + 16; const rectHeight = 20; const rectY = py + 32;
                  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.beginPath();
                  if (ctx.roundRect) ctx.roundRect(px - rectWidth/2, rectY - rectHeight/2, rectWidth, rectHeight, 10); else ctx.rect(px - rectWidth/2, rectY - rectHeight/2, rectWidth, rectHeight);
                  ctx.fill(); ctx.fillStyle = '#FFFFFF'; ctx.fillText(t1.name, px, rectY);
                }
            }
        });

        progress++; if (progress > stepsPerFrame) { progress = 0; frameIdx++; }
        if (frameIdx < animationFrames.length - 1 || (frameIdx === animationFrames.length - 1 && progress < fps * 0.5)) { setTimeout(draw, 1000 / fps); } else { setTimeout(() => recorder.stop(), 200); }
    };
    setTimeout(draw, 100);
  };

  // ==========================================
  // 5. 팝업 렌더링 함수 모음 (모두 최상단 배치)
  // ==========================================
  function renderCalendarDays() {
    const year = viewDate.getFullYear(); const month = viewDate.getMonth(); const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="p-2" />);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayMatches = matchesByDate[dateStr] || [];
      days.push(
        <div key={day} className="p-2 aspect-square border border-slate-700/50 rounded-xl relative flex flex-col items-center bg-slate-800/30">
          <span className="text-xs font-bold text-slate-300">{day}</span>
          <div className="flex gap-1 mt-1">
            {dayMatches.map((m, idx) => (<div key={idx} className={`w-1.5 h-1.5 rounded-full ${m.status === 'completed' ? 'bg-slate-500' : 'bg-blue-400'}`} />))}
          </div>
        </div>
      );
    }
    return days;
  }

  function renderSystemModals() {
    return (
      <>
        {systemAlert.isOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
            <div className="bg-slate-800 p-6 rounded-2xl max-w-sm w-full border border-slate-700 shadow-xl text-center animate-in fade-in zoom-in-95 duration-200">
              <p className="text-white font-bold mb-6 whitespace-pre-line">{systemAlert.message}</p>
              <button onClick={() => setSystemAlert({isOpen: false, message: ''})} className="w-full py-3 bg-blue-500 hover:bg-blue-400 transition text-white rounded-xl font-bold">확인</button>
            </div>
          </div>
        )}
        {systemConfirm.isOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
            <div className="bg-slate-800 p-6 rounded-2xl max-w-sm w-full border border-slate-700 shadow-xl text-center animate-in fade-in zoom-in-95 duration-200">
              <p className="text-white font-bold mb-6 whitespace-pre-line">{systemConfirm.message}</p>
              <div className="flex gap-3">
                <button onClick={() => setSystemConfirm({isOpen: false, message: '', onConfirm: null})} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 transition text-white rounded-xl font-bold">취소</button>
                <button onClick={() => { systemConfirm.onConfirm(); setSystemConfirm({isOpen: false, message: '', onConfirm: null}); }} className="flex-1 py-3 bg-blue-500 hover:bg-blue-400 transition text-white rounded-xl font-bold">확인</button>
              </div>
            </div>
          </div>
        )}
        {isProcessing && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]">
            <div className="bg-slate-800 p-6 rounded-3xl flex flex-col items-center shadow-xl border border-slate-700 animate-in fade-in zoom-in-95">
              <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div>
              <p className="text-white font-bold text-sm tracking-wide">데이터 저장 중...</p>
            </div>
          </div>
        )}
      </>
    );
  }

  function renderShareModal() {
    if (!shareModal.isOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/90 flex justify-center items-center p-4 z-[90]">
        <div className="w-full max-w-sm flex flex-col items-center max-h-[90vh]">
          {shareModal.step === 1 ? (
            <div className="bg-slate-800 border border-slate-700 p-6 rounded-3xl w-full shadow-xl flex flex-col items-center text-center animate-in zoom-in-95">
              <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4 mt-8"></div>
              <h2 className="text-lg font-black text-white mb-1">리포트 미디어 생성 중...</h2>
              <p className="text-sm text-slate-400 font-medium mb-8">화면을 렌더링하고 있습니다.</p>
            </div>
          ) : (
            <div className="bg-slate-800 border border-slate-700 p-5 rounded-3xl w-full shadow-xl flex flex-col items-center text-center flex-1 min-h-0 animate-in fade-in">
              <h2 className="text-lg font-black text-white flex items-center gap-1 mb-4 shrink-0">
                <MessageCircle size={18} className="text-blue-500"/> 미디어 생성 완료
              </h2>
              <div className="w-full flex-1 overflow-y-auto rounded-xl bg-slate-900 p-2 shadow-inner border border-slate-700/50 hide-scrollbar flex justify-center items-center">
                {shareModal.imgUrl && (
                   shareModal.isVideo ? (
                     <video src={shareModal.imgUrl} autoPlay loop playsInline controls className="w-full h-auto rounded-lg shadow-sm" />
                   ) : (
                     <img src={shareModal.imgUrl} alt="Preview" className="w-full h-auto rounded-lg shadow-sm" />
                   )
                )}
              </div>
              <div className="w-full mt-5 space-y-3 shrink-0">
                <button onClick={doActualShare} className="w-full py-4 bg-[#FEE500] text-slate-900 rounded-2xl font-black text-lg hover:bg-[#FEE500]/90 transition shadow-lg flex items-center justify-center gap-2">
                  <Share2 size={20} /> 공유 및 저장
                </button>
                <button onClick={() => setShareModal({isOpen: false, step: 1, data: null, file: null, imgUrl: null, isVideo: false})} className="w-full py-3 text-slate-400 font-bold hover:text-white transition bg-slate-700/50 rounded-xl border border-slate-700">
                  닫기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderHiddenCaptureArea() {
    if (!shareModal.isOpen || !shareModal.data || shareModal.isVideo) return null;
    return (
      <div className="fixed top-0 left-0 w-[500px] opacity-0 pointer-events-none z-[-100] overflow-visible">
        <div id="capture-area-hidden" className="bg-slate-900 p-8 w-full flex flex-col items-center text-left text-slate-200 border-none pb-12">
          
          <div className="mb-6 w-full pb-5 border-b border-slate-700">
            <h3 className="font-black text-white text-[28px] leading-tight mb-2">
               {shareModal.data.matchType === 'external' ? `[교류전] vs ${shareModal.data.opponentName}` : `[자체전] ${shareModal.data.location}`}
            </h3>
            <p className="text-slate-400 text-[15px] font-medium">
               {new Date(shareModal.data.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} {formatTimeAmPm(shareModal.data.time)} · 참석 {(shareModal.data.attendees || []).length}명
            </p>
          </div>

          <div className="w-full bg-slate-800 rounded-2xl p-6 mb-6 border border-slate-700/50 shadow-md">
             <div className="font-black text-slate-400 text-[15px] border-b border-slate-700/50 pb-3 mb-4">순위표</div>
             <table className="w-full text-[15px] text-center">
               <thead>
                 <tr className="text-slate-500 font-bold">
                   <th className="pb-4">순위</th><th className="pb-4 text-left">팀</th><th className="pb-4">승점</th><th className="pb-4">승</th><th className="pb-4">무</th><th className="pb-4">패</th><th className="pb-4">득</th><th className="pb-4">실</th><th className="pb-4">득실</th>
                 </tr>
               </thead>
               <tbody>
                 {calculateStandings(shareModal.data).map((st, i) => (
                   <tr key={st.team} className="border-t border-slate-700/30 text-slate-300">
                     <td className={`py-4 font-black ${i === 0 ? 'text-yellow-400' : 'text-slate-400'}`}>{i + 1}</td>
                     <td className={`py-4 font-bold text-left ${TEAM_TEXT_COLORS[st.team]}`}>{getTeamDisplayName(shareModal.data, st.team)}</td>
                     <td className="py-4 text-blue-400 font-black">{st.pts}</td>
                     <td className="py-4 text-white">{st.w}</td>
                     <td className="py-4 text-slate-400">{st.d}</td>
                     <td className="py-4 text-slate-400">{st.l}</td>
                     <td className="py-4 text-white">{st.gf}</td>
                     <td className="py-4 text-slate-400">{st.ga}</td>
                     <td className="py-4 text-white">{st.gd > 0 ? '+'+st.gd : st.gd}</td>
                   </tr>
                 ))}
               </tbody>
             </table>
          </div>

          <div className="w-full space-y-5 mb-6">
               {(shareModal.data.quarterScores || []).length > 0 ? (shareModal.data.quarterScores || []).map(qs => {
                 const qLogs = (shareModal.data.logs || []).filter(l => l.quarter === qs.quarter);
                 return (
                   <div key={qs.quarter} className="w-full bg-slate-800 rounded-2xl p-6 border border-slate-700/50 shadow-md">
                      <div className="relative flex justify-center items-center border-b border-slate-700/50 pb-4 mb-4">
                        <span className="absolute left-0 font-black text-blue-400 text-[18px]">{qs.quarter}Q</span>
                        <span className="font-black text-white text-[20px] text-center flex items-center">
                          <span className={TEAM_TEXT_COLORS[qs.team1]}>{getTeamDisplayName(shareModal.data, qs.team1)}</span> 
                          <span className="text-slate-500 mx-5">{qs.score1} : {qs.score2}</span> 
                          <span className={TEAM_TEXT_COLORS[qs.team2]}>{getTeamDisplayName(shareModal.data, qs.team2)}</span>
                        </span>
                      </div>
                      <div className="space-y-4">
                        {qLogs.length > 0 ? qLogs.map(l => {
                          const isLeft = l.teamLetter === qs.team1;
                          return (
                            <div key={l.id} className={`flex items-start gap-4 w-full ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}>
                              <span className="text-slate-500 text-[12px] w-12 shrink-0 text-center">{l.time}</span>
                              <div className={`flex flex-col ${isLeft ? 'items-start' : 'items-end'}`}>
                                <div className="text-slate-100 font-bold text-[15px] flex items-center gap-2">
                                  <span className={TEAM_TEXT_COLORS[l.teamLetter]}>⚽</span> {l.scorerName}
                                  {l.isPK && <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded ml-1 border border-red-500/30">PK</span>}
                                </div>
                                {l.remark && <div className="text-[13px] bg-slate-900/80 px-2.5 py-1.5 rounded text-slate-300 mt-1.5 inline-block border border-slate-700/50">{l.remark}</div>}
                                {l.assistName && (
                                  <div className="text-slate-500 mt-1 flex items-center gap-1.5">
                                    <Footprints size={14} className="text-slate-500"/> <span className="text-[13px]">{l.assistName}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        }) : <div className="text-[14px] text-slate-500 text-center py-4 italic">득점 기록이 없습니다.</div>}
                      </div>
                   </div>
                 )
               }) : (
                 <div className="text-[14px] text-slate-500 text-center py-6 bg-slate-800 rounded-2xl border border-slate-700/50 shadow-md">아직 기록이 없습니다.</div>
               )}
          </div>

          <div className="w-full bg-slate-800 rounded-2xl p-6 border border-slate-700/50 shadow-md">
              <div className="text-[15px] text-slate-400 mb-5 font-black border-b border-slate-700/50 pb-3 flex justify-between items-end">
                  <span>참석자 최종 편성 명단</span>
              </div>
              <div className="space-y-6">
                {TEAM_LETTERS.slice(0, shareModal.data.teamCount).map(teamLetter => {
                  const teamPlayers = players.filter(p => (shareModal.data.attendees || []).includes(p.id) && ((shareModal.data.teamAssignments || {})[p.id]) === teamLetter);
                  if(teamPlayers.length === 0) return null;
                  return (
                    <div key={teamLetter}>
                      <div className={`text-[14px] font-black mb-3 ${TEAM_TEXT_COLORS[teamLetter]}`}>
                        {getTeamDisplayName(shareModal.data, teamLetter)}
                      </div>
                      <div className="flex flex-wrap gap-2.5">
                        {teamPlayers.map(p => (
                          <div key={p.id} className="bg-slate-900 px-3.5 py-2.5 rounded-full border border-slate-600/50 shadow-sm flex items-center">
                            <span className="font-bold text-white text-[14px] tracking-wide">{p.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
          </div>
        </div>
      </div>
    );
  }

  function renderDetailModal() {
    if (!detailModal.isOpen || !detailMatch) return null;
    return (
      <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-[100] animate-in fade-in">
        <div className="bg-slate-800 rounded-3xl w-full max-w-md border border-slate-700 max-h-[85vh] flex flex-col shadow-xl overflow-hidden">
          <div className="p-6 border-b border-slate-700 bg-slate-900 shrink-0">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${detailMatch.matchType === 'external' ? 'bg-purple-500/20 text-purple-400' : 'bg-green-500/20 text-green-400'}`}>
                    {detailMatch.matchType === 'external' ? '교류전' : '자체전'}
                  </span>
                  <h2 className="text-lg font-black text-white">{detailMatch.date} 결과</h2>
                </div>
                <p className="text-sm text-slate-400"><MapPin size={12} className="inline mr-1"/>{detailMatch.location}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => triggerShare(detailMatch)} className="text-yellow-500 bg-slate-800 p-2 rounded-full hover:bg-slate-700 transition"><Share2 size={20}/></button>
                <button onClick={() => { setDetailModal({isOpen: false, match: null}); setDetailModalMatchId(null); }} className="text-slate-400 bg-slate-800 p-2 rounded-full hover:text-white transition"><X size={20}/></button>
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 hide-scrollbar space-y-6">
            <div className="bg-slate-900 rounded-2xl p-4 border border-slate-700">
              <div className="text-xs text-slate-400 mb-3 font-bold border-b border-slate-800 pb-2">순위표</div>
              <table className="w-full text-xs text-center">
                <thead>
                  <tr className="text-slate-500 font-bold">
                    <th className="pb-2">순위</th><th className="pb-2 text-left">팀</th><th className="pb-2">승점</th><th className="pb-2">승</th><th className="pb-2">무</th><th className="pb-2">패</th><th className="pb-2">득</th><th className="pb-2">실</th><th className="pb-2">득실</th>
                  </tr>
                </thead>
                <tbody>
                  {calculateStandings(detailMatch).map((st, index) => (
                    <tr key={st.team} className="border-t border-slate-800">
                      <td className={`py-2 font-black ${index === 0 ? 'text-yellow-400' : 'text-slate-400'}`}>{index + 1}</td>
                      <td className={`py-2 text-left font-bold ${TEAM_TEXT_COLORS[st.team]}`}>{getTeamDisplayName(detailMatch, st.team)}</td>
                      <td className="py-2 text-blue-400 font-black">{st.pts}</td>
                      <td className="py-2 text-white">{st.w}</td>
                      <td className="py-2 text-slate-400">{st.d}</td>
                      <td className="py-2 text-slate-400">{st.l}</td>
                      <td className="py-2 text-white">{st.gf}</td>
                      <td className="py-2 text-slate-400">{st.ga}</td>
                      <td className="py-2 text-white">{st.gd > 0 ? `+${st.gd}` : st.gd}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(detailMatch.quarterScores || []).map(qs => (
              <div key={qs.quarter} className="bg-slate-900 rounded-2xl p-4 border border-slate-700 pb-4">
                 <div className="relative flex justify-center items-center border-b border-slate-800 pb-3 mb-3">
                   <span className="absolute left-0 font-black text-blue-400">{qs.quarter}Q</span>
                   <span className="font-bold text-white text-lg text-center">
                     <span className={TEAM_TEXT_COLORS[qs.team1]}>{getTeamDisplayName(detailMatch, qs.team1)}</span> 
                     <span className="text-slate-500 mx-3">{qs.score1} : {qs.score2}</span> 
                     <span className={TEAM_TEXT_COLORS[qs.team2]}>{getTeamDisplayName(detailMatch, qs.team2)}</span>
                   </span>
                 </div>
                 <div className="space-y-3">
                   {(detailMatch.logs || []).filter(l => l.quarter === qs.quarter).map(l => {
                     const isLeft = l.teamLetter === qs.team1;
                     return (
                       <div 
                         key={l.id} 
                         onClick={() => isAdmin && openLogEditModal(l, detailMatch)}
                         className={`flex items-start gap-2 w-full ${isLeft ? 'flex-row' : 'flex-row-reverse'} ${isAdmin ? 'cursor-pointer hover:bg-slate-800 p-1 rounded-lg transition -mx-1 px-1' : ''}`}
                       >
                         <span className="text-slate-600 text-[10px] w-8 shrink-0 text-center mt-1">{l.time}</span>
                         <div className={`flex flex-col ${isLeft ? 'items-start' : 'items-end'}`}>
                           <div className="text-white font-bold text-sm flex items-center gap-1">
                             <span className={TEAM_TEXT_COLORS[l.teamLetter]}>⚽</span> {l.scorerName}
                             {l.isPK && <span className="text-[9px] bg-red-500/20 text-red-400 px-1 py-0.5 rounded ml-1 border border-red-500/30">PK</span>}
                           </div>
                           {l.remark && <div className="text-[11px] bg-slate-800/80 px-2 py-1 rounded text-slate-300 mt-1 inline-block border border-slate-700">{l.remark}</div>}
                           {l.assistName && (
                             <div className="text-slate-400 mt-1 flex items-center gap-1">
                               <Footprints size={12} className="text-slate-500"/> <span className="text-xs">{l.assistName}</span>
                             </div>
                           )}
                         </div>
                       </div>
                     )
                   })}
                   {(detailMatch.logs || []).filter(l => l.quarter === qs.quarter).length === 0 && <div className="text-sm text-slate-500 italic text-center py-2">득점 기록이 없습니다.</div>}
                 </div>
                 {isAdmin && (
                    <div className="flex justify-center mt-4 pt-4 border-t border-slate-800/50">
                      <button onClick={() => setGoalFlow({ isOpen: true, step: 1, matchId: detailMatch.id, quarter: qs.quarter, teamLetter: qs.team1, availableTeams: [qs.team1, qs.team2], scorer: null, isPK: false, remark: '', isMissingAdd: true })} className="text-[11px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 px-3 py-1.5 rounded-lg flex items-center gap-1 transition">
                        <Plus size={12}/> 누락된 득점 추가
                      </button>
                    </div>
                 )}
              </div>
            ))}

            <div className="bg-slate-900 rounded-2xl p-4 border border-slate-700">
              <div className="text-xs text-slate-400 mb-4 font-bold border-b border-slate-800 pb-2 flex justify-between items-end">
                  <span>참석자 최종 편성 명단</span>
                  {isAdmin && (
                    <div className="flex gap-2 mb-1">
                      <button 
                        onClick={() => {
                          setDetailModal({isOpen: false, match: null});
                          setDetailModalMatchId(null);
                          setAssignmentModal({ isOpen: true, match: detailMatch });
                        }}
                        className="bg-slate-800 text-purple-400 px-2.5 py-1 rounded text-[10px] font-bold border border-purple-500/30 flex items-center gap-1 hover:bg-slate-700 transition"
                      >
                        <Users size={12}/> 편성 수정
                      </button>
                      <button 
                        onClick={() => {
                          setDetailModal({isOpen: false, match: null});
                          setDetailModalMatchId(null);
                          openMatchModal(detailMatch);
                        }}
                        className="bg-slate-800 text-blue-400 px-2.5 py-1 rounded text-[10px] font-bold border border-blue-500/30 flex items-center gap-1 hover:bg-slate-700 transition"
                      >
                        <Edit size={12}/> 명단 수정
                      </button>
                    </div>
                  )}
              </div>
              <div className="space-y-4">
                {TEAM_LETTERS.slice(0, detailMatch.teamCount).map(teamLetter => {
                  const teamPlayers = players.filter(p => 
                    (detailMatch.attendees || []).includes(p.id) && 
                    ((detailMatch.teamAssignments || {})[p.id]) === teamLetter
                  );
                  if(teamPlayers.length === 0) return null;
                  return (
                    <div key={teamLetter}>
                      <div className={`text-[11px] font-black mb-2 ${TEAM_TEXT_COLORS[teamLetter]}`}>
                        {getTeamDisplayName(detailMatch, teamLetter)}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {teamPlayers.map(p => (
                          <div key={p.id} className="bg-slate-800 px-3.5 py-2.5 rounded-full border border-slate-600/50 shadow-sm flex items-center">
                            <span className="font-bold text-white text-[14px] tracking-wide">{p.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderMatchModalForm() {
    if (!matchModal.isOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-end justify-center z-[100]">
        <div className="bg-slate-800 p-6 rounded-t-3xl w-full max-w-md border-t border-slate-700 animate-in slide-in-from-bottom max-h-[90vh] flex flex-col shadow-xl">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <h2 className="text-xl font-bold text-white">{matchModal.match ? '일정 수정' : '새 일정 등록'}</h2>
            <button onClick={() => setMatchModal({isOpen: false, match: null})} className="text-slate-400 hover:text-white"><X size={24}/></button>
          </div>
          
          <div className="flex bg-slate-900 rounded-xl p-1 mb-4 shrink-0">
             <button 
               type="button" 
               onClick={() => setMatchTypeForm('internal')} 
               className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition ${matchTypeForm === 'internal' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-400'}`}
             >
               자체 팀 나누기
             </button>
             <button 
               type="button" 
               onClick={() => setMatchTypeForm('external')} 
               className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition ${matchTypeForm === 'external' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-400'}`}
             >
               외부 팀과 매치
             </button>
          </div>

          <form id="matchForm" onSubmit={saveMatch} className="space-y-4 overflow-y-auto hide-scrollbar flex-1 pb-4 pr-2">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-400 mb-1">날짜</label>
                <input type="date" name="date" required defaultValue={matchModal.match?.date || getTodayString()} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-400 mb-1">시간</label>
                <input type="time" name="time" required defaultValue={matchModal.match?.time || "06:30"} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">경기 장소</label>
              <input type="text" name="location" required defaultValue={matchModal.match?.location || ""} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
            </div>

            {matchTypeForm === 'external' ? (
              <div>
                <label className="block text-xs font-bold text-purple-400 mb-1">상대팀 이름</label>
                <input type="text" name="opponentName" required placeholder="예: FC 라이언" defaultValue={matchModal.match?.opponentName || ""} className="w-full bg-slate-900 border border-purple-500/50 p-3 rounded-xl text-white outline-none focus:border-purple-500" />
              </div>
            ) : null}

            <div className="flex gap-4">
              {matchTypeForm === 'internal' && (
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-400 mb-1">총 팀 개수</label>
                  <select name="teamCount" defaultValue={matchModal.match?.teamCount || 2} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none">
                    <option value="2">2팀 (A,B)</option>
                    <option value="3">3팀 (A,B,C)</option>
                    <option value="4">4팀 (A,B,C,D)</option>
                  </select>
                </div>
              )}
              <div className={matchTypeForm === 'external' ? 'w-full' : 'flex-1'}>
                <label className="block text-xs font-bold text-slate-400 mb-1">총 쿼터 수</label>
                <input type="number" name="totalQuarters" required defaultValue={matchModal.match?.totalQuarters || 4} min="1" max="10" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
              </div>
            </div>
            
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-400 mb-2">참석자 체크 <span className="text-slate-500 font-normal ml-1">({matchTypeForm === 'external' ? '선택된 인원은 모두 한 팀이 됩니다' : '경기 당일 팀 편성을 진행합니다'})</span></label>
              <div className="grid grid-cols-2 gap-2">
                {currentTeamPlayers.map(p => (
                  <label key={p.id} className="flex items-center gap-2 bg-slate-900 p-3 rounded-lg border border-slate-700 cursor-pointer hover:border-slate-500 transition">
                    <input type="checkbox" name={`attendee_${p.id}`} defaultChecked={matchModal.match ? (matchModal.match.attendees || []).includes(p.id) : false} className="accent-blue-500 w-4 h-4 rounded" />
                    <span className="text-sm font-bold text-white">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </form>
          <div className="pt-4 shrink-0 border-t border-slate-700">
            <button type="submit" form="matchForm" className="w-full py-4 bg-blue-500 hover:bg-blue-400 text-white rounded-xl font-bold text-lg transition shadow-lg">저장하기</button>
          </div>
        </div>
      </div>
    );
  }

  function renderAssignmentModal() {
    if (!assignmentModal.isOpen || !assignmentModal.match) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100]">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-md border border-slate-700 max-h-[80vh] flex flex-col shadow-xl">
          <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-700">
            <div><h2 className="text-lg font-bold text-white">참석자 팀 편성</h2></div>
            <button onClick={() => setAssignmentModal({isOpen: false, match: null})} className="text-white bg-blue-500 px-4 py-2 rounded-xl font-bold">완료</button>
          </div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-2 hide-scrollbar">
            {currentTeamPlayers.filter(p => (assignmentModal.match.attendees || []).includes(p.id)).map(p => {
              const currentTeam = (assignmentModal.match.teamAssignments || {})[p.id] || null;
              return (
                <div key={p.id} className="bg-slate-900 p-3 rounded-xl flex justify-between items-center border border-slate-700">
                  <div className="font-bold text-white">{p.name} <span className="text-xs text-slate-500 ml-1">{p.birthYear}</span></div>
                  <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
                    {TEAM_LETTERS.slice(0, assignmentModal.match.teamCount).map(t => (
                      <button 
                        key={t} onClick={() => assignTeam(p.id, t)}
                        className={`w-8 h-8 flex items-center justify-center text-xs font-black rounded-md transition ${currentTeam === t ? TEAM_COLORS[t] + ' shadow' : 'bg-slate-700 text-slate-400 hover:text-white'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderRosterModalForm() {
    if (!rosterModal.isOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100]">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
          <h2 className="text-xl font-bold text-white mb-6 text-center">{rosterModal.player ? '명단 수정' : '새 선수 등록'}</h2>
          <form onSubmit={saveRoster} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">이름</label>
              <input type="text" name="name" required defaultValue={rosterModal.player?.name || ""} placeholder="선수 이름" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">출생 연도 (2자리)</label>
              <input type="number" name="birthYear" required defaultValue={rosterModal.player?.birthYear || ""} placeholder="예: 96" min="0" max="99" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
            </div>
            <div className="flex gap-3 pt-4">
              <button type="button" onClick={() => setRosterModal({isOpen: false, player: null})} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold transition hover:bg-slate-600">취소</button>
              <button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold transition hover:bg-blue-400 shadow-lg">저장하기</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderAuthModal() {
    if (!authModal.isOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100]">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <Shield size={20} className="text-blue-500"/> 
            {authModal.type === 'loginAdminAuth' ? '시스템 관리자 인증' : authModal.type === 'adminMode' ? '팀 관리자 전환' : `${authModal.targetTeam?.name} 로그인`}
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            {authModal.type === 'teamLogin' ? "팀 조회를 위해 비밀번호를 입력하세요." : authModal.type === 'adminMode' ? "현재 팀의 일정 관리 권한을 위해\n팀 관리자 비밀번호를 입력하세요." : "관리자 시스템 마스터 비밀번호를 입력하세요."}
          </p>
          <form onSubmit={handleAuthSubmit}>
            <input 
              type="password" 
              name="password" 
              required
              autoFocus 
              placeholder="비밀번호" 
              className="w-full bg-slate-900 border border-slate-700 p-4 rounded-xl text-white mb-4 text-center tracking-[0.5em] text-lg font-bold outline-none focus:border-blue-500 transition" 
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setAuthModal({ isOpen: false })} className="flex-1 py-3 bg-slate-700 rounded-xl text-white font-bold">취소</button>
              <button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">확인</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderCreateTeamModal() {
    if (!isCreateTeamOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100]">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
          <h2 className="text-xl font-bold text-white mb-6 text-center">신규 팀 생성</h2>
          <form onSubmit={handleCreateTeam} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">팀 로고 (이미지 업로드)</label>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 shrink-0 bg-slate-900 border border-slate-700 rounded-full flex items-center justify-center overflow-hidden text-2xl bg-white/5">
                  {newTeamLogo?.startsWith('data:image') ? <img src={newTeamLogo} alt="Preview" className="w-full h-full object-cover" /> : (newTeamLogo || '⚽')}
                </div>
                <input type="file" accept="image/*" onChange={async (e) => { const file = e.target.files[0]; if (file) { const compressedLogo = await resizeImage(file); setNewTeamLogo(compressedLogo); } }} className="text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-500/10 file:text-blue-500 hover:file:bg-blue-500/20 cursor-pointer w-full"/>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">팀 이름</label>
              <input type="text" name="teamName" required placeholder="예: 킥오프 FC" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">팀 전용 비밀번호</label>
              <input type="text" name="password" required placeholder="팀원들과 공유할 조회용 비밀번호" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-blue-400 mb-1">팀 관리자 비밀번호</label>
              <input type="text" name="adminPassword" required placeholder="일정 등록/수정용 관리자 비밀번호" className="w-full bg-slate-900 border border-blue-500/50 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
            </div>
            <div className="flex gap-3 pt-4">
              <button type="button" onClick={() => { setIsCreateTeamOpen(false); setNewTeamLogo(null); }} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button>
              <button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">생성</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderEditTeamModal() {
    if (!editTeamModal.isOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100]">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
          <h2 className="text-xl font-bold text-white mb-6 text-center">팀 정보 수정</h2>
          <form onSubmit={handleEditTeam} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">팀 로고 변경</label>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 shrink-0 bg-slate-900 border border-slate-700 rounded-full flex items-center justify-center overflow-hidden text-2xl bg-white/5">
                  {editTeamLogo?.startsWith('data:image') ? <img src={editTeamLogo} alt="Preview" className="w-full h-full object-cover" /> : (editTeamLogo || '⚽')}
                </div>
                <input type="file" accept="image/*" onChange={async (e) => { const file = e.target.files[0]; if (file) { const compressedLogo = await resizeImage(file); setEditTeamLogo(compressedLogo); } }} className="text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-500/10 file:text-blue-500 hover:file:bg-blue-500/20 cursor-pointer w-full"/>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">팀 이름</label>
              <input type="text" name="teamName" required defaultValue={editTeamModal.team?.name} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">팀 전용 비밀번호</label>
              <input type="text" name="password" required defaultValue={editTeamModal.team?.password} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-blue-400 mb-1">팀 관리자 비밀번호</label>
              <input type="text" name="adminPassword" required defaultValue={editTeamModal.team?.adminPassword || 'admin'} className="w-full bg-slate-900 border border-blue-500/50 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
            </div>
            <div className="flex gap-3 pt-4">
              <button type="button" onClick={() => setEditTeamModal({isOpen: false, team: null})} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button>
              <button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">저장</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderAdminPwdChangeModal() {
    if (!adminPwdChangeModal) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100]">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <Shield size={20} className="text-blue-500"/> 마스터 비밀번호 변경
          </h2>
          <p className="text-xs text-slate-400 mb-6">새로운 시스템 마스터 비밀번호를 입력하세요.</p>
          <form onSubmit={handleAdminPwdChange}>
            <input type="password" name="newAdminPwd" required autoFocus placeholder="새 마스터 비밀번호" className="w-full bg-slate-900 border border-slate-700 p-4 rounded-xl text-white mb-4 text-center tracking-[0.2em] text-lg font-bold outline-none focus:border-blue-500 transition" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setAdminPwdChangeModal(false)} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button>
              <button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">변경하기</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderGoalFlowModal() {
    if (!goalFlow.isOpen) return null;
    const gfMatchId = goalFlow.matchId || liveMatchId;
    const gfMatch = matches.find(m => m.id === gfMatchId);
    
    return (
      <div className="fixed inset-0 bg-black/90 flex items-end justify-center z-[100]">
        <div className={`bg-slate-800 p-6 rounded-t-3xl w-full max-w-md max-h-[85vh] flex flex-col border-t-4 animate-in slide-in-from-bottom ${goalFlow.teamLetter ? TEAM_COLORS[goalFlow.teamLetter].split(' ')[2] : 'border-slate-500'}`}>
          <div className="flex justify-between items-center mb-6 shrink-0">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              {goalFlow.teamLetter && (
                 <span className={`w-6 h-6 rounded flex items-center justify-center text-sm ${TEAM_COLORS[goalFlow.teamLetter]}`}>{goalFlow.teamLetter}</span>
              )}
              {goalFlow.step === 1 ? '득점자 선택' : '어시스트 선택 (선택사항)'}
            </h2>
            <button onClick={() => setGoalFlow({isOpen: false, step: 1, matchId: null, quarter: null, teamLetter: null, scorer: null, isPK: false, remark: '', isMissingAdd: false})} className="text-slate-400 bg-slate-700 p-2 rounded-full"><X size={20}/></button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pb-6 hide-scrollbar">
            
            {goalFlow.isMissingAdd && (
              <div className="flex gap-2 mb-4 bg-slate-900 p-1 rounded-xl">
                {(goalFlow.availableTeams || []).map(t => (
                  <button 
                    key={t}
                    onClick={() => setGoalFlow({...goalFlow, teamLetter: t})}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition ${goalFlow.teamLetter === t ? TEAM_COLORS[t] + ' shadow' : 'text-slate-500 hover:text-white'}`}
                  >
                    {t}팀
                  </button>
                ))}
              </div>
            )}

            {goalFlow.step === 1 && (
               <div className="space-y-3 mb-4 p-4 bg-slate-900 rounded-xl border border-slate-700">
                 <label className="flex items-center gap-2 cursor-pointer">
                   <input 
                      type="checkbox" 
                      checked={goalFlow.isPK || false} 
                      onChange={(e) => setGoalFlow({...goalFlow, isPK: e.target.checked})} 
                      className="accent-blue-500 w-4 h-4 rounded" 
                   />
                   <span className="text-white font-bold text-sm">페널티킥 (PK) 득점 여부</span>
                 </label>
                 <div>
                   <input 
                      type="text" 
                      placeholder="비고 (예: 멋진 중거리 슛, 자책골 등)"
                      value={goalFlow.remark || ''}
                      onChange={(e) => setGoalFlow({...goalFlow, remark: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-600 p-2.5 rounded-lg text-white text-sm outline-none focus:border-blue-500" 
                   />
                 </div>
               </div>
            )}

            {goalFlow.step === 2 && (
              <button onClick={() => handleGoalSubmit(null, goalFlow.teamLetter)} className="w-full p-4 rounded-xl text-left font-bold border-2 border-dashed border-slate-600 text-slate-400 hover:border-slate-400 mb-4 transition">
                ❌ 도움 없음 (단독 돌파 등)
              </button>
            )}
            
            {goalFlow.step === 1 && gfMatch?.matchType === 'external' && goalFlow.teamLetter === 'B' ? (
              <div className="flex gap-2 mt-2">
                <button onClick={() => handleOwnGoalSubmit('B', true)} className="flex-1 p-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 border-dashed text-slate-400 rounded-xl font-bold transition text-[13px] flex flex-col items-center justify-center gap-1">
                  <span className="text-base">👻</span> 우리팀 자책골
                </button>
                <button onClick={handleOpponentGoalSubmit} className="flex-[2] p-4 bg-blue-500 hover:bg-blue-400 text-white rounded-xl font-bold shadow-lg transition text-lg">
                  상대팀 득점 기록 완료
                </button>
              </div>
            ) : (goalFlow.step === 1 || goalFlow.step === 2) && goalFlow.teamLetter ? (
              <>
                {goalFlow.step === 1 && (
                  <button onClick={() => handleOwnGoalSubmit(goalFlow.teamLetter, false)} className="w-full p-4 mb-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 border-dashed text-slate-300 rounded-xl font-bold transition flex justify-center items-center gap-2">
                    👻 상대팀 자책골 (Own Goal)로 득점
                  </button>
                )}
                {players.filter(p => (gfMatch?.attendees || []).includes(p.id) && ((gfMatch?.teamAssignments || {})[p.id] || 'A') === goalFlow.teamLetter)
                .filter(p => goalFlow.step === 1 || p.id !== goalFlow.scorer)
                .map(p => (
                <button key={p.id} onClick={() => handleGoalSubmit(p.id, goalFlow.teamLetter)} className="w-full p-4 mb-2 bg-slate-900 rounded-xl flex items-center gap-4 hover:bg-slate-700 border border-slate-700 transition">
                  <span className="font-bold text-lg text-white flex-1 text-left">{p.name}</span>
                  <span className="text-xs text-slate-500">{p.birthYear}</span>
                </button>
                ))}
              </>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  function renderLogEditModal() {
    if (!logEditModal.isOpen || !logEditModal.match || !logEditModal.log) return null;
    const m = logEditModal.match;
    const l = logEditModal.log;
    const isOpponentFakeLog = m.matchType === 'external' && l.teamLetter === 'B';

    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[60]">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm shadow-xl border border-slate-700 animate-in zoom-in-95">
          <h2 className="text-xl font-bold text-white mb-6">득점 기록 수정</h2>
          {isOpponentFakeLog ? (
            <div>
              <p className="text-slate-400 mb-6 text-sm">상대팀의 득점은 삭제만 가능합니다.</p>
              <div className="flex gap-3">
                <button onClick={() => setLogEditModal({isOpen: false, match: null, log: null})} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button>
                <button onClick={handleLogDelete} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold">기록 삭제</button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleLogEditSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2">득점자</label>
                <select name="scorerId" defaultValue={l.scorerId || ""} required className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none">
                  {!l.scorerId && <option value="">{l.scorerName}</option>}
                  {players.filter(p => (m.attendees || []).includes(p.id) && ((m.teamAssignments || {})[p.id] || 'A') === l.teamLetter).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2">도움 (어시스트)</label>
                <select name="assistId" defaultValue={l.assistId || 'none'} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none">
                  <option value="none">도움 없음</option>
                  {players.filter(p => (m.attendees || []).includes(p.id) && ((m.teamAssignments || {})[p.id] || 'A') === l.teamLetter).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 p-3 bg-slate-900 rounded-xl border border-slate-700 cursor-pointer mt-2">
                <input type="checkbox" name="isPK" value="true" defaultChecked={l.isPK || false} className="accent-blue-500 w-4 h-4 rounded" />
                <span className="text-white font-bold text-sm">페널티킥 (PK) 득점 여부</span>
              </label>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 mt-2">비고 (선택사항)</label>
                <input type="text" name="remark" defaultValue={l.remark || ''} placeholder="예: 멋진 중거리 슛" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
              </div>
              <div className="flex gap-3 pt-4 border-t border-slate-700">
                <button type="button" onClick={() => setLogEditModal({isOpen: false, match: null, log: null})} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button>
                <button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">저장하기</button>
              </div>
              <button type="button" onClick={handleLogDelete} className="w-full py-3 mt-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-bold text-sm hover:bg-red-500/20 transition">기록 완전 삭제</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  function renderTokenEditModal() {
    if (!tokenEditModal.isOpen || !tokenEditModal.token) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100] animate-in fade-in">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
          <h2 className="text-xl font-bold text-white mb-4 text-center">선수 정보 설정</h2>
          <form onSubmit={handleTokenEditSave} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">포지션 선택</label>
              <select name="position" defaultValue={tokenEditModal.token.position} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none">
                {['FW', 'WF', 'AM', 'CM', 'DM', 'RB', 'LB', 'CB', 'GK'].map(pos => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">이름 등록 (선택)</label>
              <input type="text" name="name" defaultValue={tokenEditModal.token.name} placeholder="예: 손흥민" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setTokenEditModal({isOpen: false, token: null})} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button>
              <button type="submit" className="flex-[2] py-3 bg-blue-500 text-white rounded-xl font-bold">저장</button>
            </div>
            <button type="button" onClick={handleTokenDelete} className="w-full py-3 mt-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl font-bold text-sm">선수 완전히 삭제</button>
          </form>
        </div>
      </div>
    );
  }

  function renderTeamSettingsModal() {
    if (!teamSettingsModal) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100]">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
          <h2 className="text-xl font-bold text-white mb-6 text-center">환경 설정</h2>
          <form onSubmit={handleTeamSettingsSave} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">팀 로고 변경</label>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 shrink-0 bg-slate-900 border border-slate-700 rounded-full flex items-center justify-center overflow-hidden text-2xl bg-white/5">
                  {teamSettingsLogo?.startsWith('data:image') ? <img src={teamSettingsLogo} alt="Preview" className="w-full h-full object-cover" /> : (teamSettingsLogo || '⚽')}
                </div>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const compressedLogo = await resizeImage(file);
                      setTeamSettingsLogo(compressedLogo);
                    }
                  }} 
                  className="text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-500/10 file:text-blue-500 hover:file:bg-blue-500/20 cursor-pointer w-full"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">팀 이름</label>
              <input type="text" name="name" required defaultValue={activeTeam?.name} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">팀 전용 비밀번호</label>
              <input type="text" name="password" required defaultValue={activeTeam?.password} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
              <p className="text-[10px] text-slate-500 mt-1">팀원들이 조회용으로 접속할 때 사용하는 비밀번호입니다.</p>
            </div>
            <div className="pt-2 mt-2 border-t border-slate-700">
              <label className="block text-xs font-bold text-blue-400 mb-1">팀 관리자 비밀번호 변경</label>
              <input type="text" name="teamAdminPassword" required defaultValue={activeTeam?.adminPassword || 'admin'} className="w-full bg-slate-900 border border-blue-500/50 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
              <p className="text-[10px] text-slate-500 mt-1">현재 팀의 일정을 등록/수정하기 위한 관리자 비밀번호입니다.</p>
            </div>
            <div className="flex gap-3 pt-4">
              <button type="button" onClick={() => setTeamSettingsModal(false)} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button>
              <button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">저장하기</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // 메인 컴포넌트 렌더링 분기 시작
  // ==========================================

  if (appState === 'login') {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-200 font-sans p-6 flex flex-col justify-center max-w-md mx-auto relative">
        {globalStyles}
        <div className="absolute top-6 right-6">
          {!isLoginAdminMode ? (
            <button onClick={() => setAuthModal({ isOpen: true, type: 'loginAdminAuth' })} className="text-xs text-slate-400 border border-slate-700 bg-slate-800 px-3 py-1.5 rounded-lg hover:text-white transition flex items-center gap-1">
              <Shield size={14}/> 관리자 설정
            </button>
          ) : (
            <button onClick={() => setIsLoginAdminMode(false)} className="text-xs text-red-400 border border-red-500/30 bg-red-500/10 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition flex items-center gap-1">
              <LogOut size={14}/> 관리자 종료
            </button>
          )}
        </div>

        <div className="text-center mb-10 mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex justify-center mb-5">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
              <div className="w-16 h-16 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl flex items-center justify-center shadow-lg relative z-10">
                <Activity size={32} className="text-blue-500" />
              </div>
            </div>
          </div>
          <h1 className="text-4xl font-black tracking-tighter mb-3 bg-gradient-to-r from-white via-blue-100 to-slate-400 text-transparent bg-clip-text">
            MATCHBOARD
          </h1>
          <p className="text-slate-400 text-sm font-medium tracking-wide">승리를 기록하는 가장 스마트한 방법</p>
          {isLoginAdminMode && (
            <div className="mt-5 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs py-2 px-4 rounded-xl font-bold inline-block animate-pulse">
              시스템 관리자 모드 활성화됨
            </div>
          )}
        </div>

        <div className="space-y-4 mb-8">
          <h2 className="text-sm font-bold text-slate-500 px-2">{isLoginAdminMode ? '등록된 팀 관리' : '내 팀 선택하기'}</h2>
          
          {!isLoaded ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
            </div>
          ) : teams.length === 0 && !isLoginAdminMode ? (
            <div className="text-center py-10 bg-slate-800/50 rounded-2xl border border-slate-700 text-sm text-slate-500 animate-in fade-in">
              등록된 팀이 없습니다.<br/>우측 상단의 <strong className="text-slate-400">관리자 설정</strong>에서<br/>새로운 팀을 생성해 주세요.
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in">
              {teams.map(team => (
                <div key={team.id} className="relative group">
                  <button 
                    onClick={() => !isLoginAdminMode && setAuthModal({ isOpen: true, type: 'teamLogin', targetTeam: team })} 
                    className={`w-full bg-slate-800 hover:bg-slate-700 p-4 rounded-2xl border border-slate-700 flex items-center gap-4 transition text-left ${isLoginAdminMode ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center text-2xl border border-slate-600 overflow-hidden shrink-0 bg-white/5">
                      {team.logo?.startsWith('data:image') ? <img src={team.logo} alt={team.name} className="w-full h-full object-cover" /> : team.logo}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-white text-lg">{team.name}</div>
                      <div className="text-xs text-slate-400">{isLoginAdminMode ? `비밀번호: ${team.password}` : '터치하여 로그인'}</div>
                    </div>
                    {!isLoginAdminMode && <ChevronRight className="text-slate-500" />}
                  </button>
                  {isLoginAdminMode && (
                    <div className="absolute top-1/2 -translate-y-1/2 right-4 flex gap-2">
                      <button onClick={() => { setEditTeamLogo(team.logo); setEditTeamModal({ isOpen: true, team }); }} className="p-2 bg-slate-700 text-slate-300 rounded-lg hover:text-white transition shadow-sm"><Edit size={16}/></button>
                      <button onClick={() => requestDeleteTeam(team.id)} className="p-2 bg-slate-700 text-slate-300 rounded-lg hover:text-red-400 transition shadow-sm"><Trash2 size={16}/></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {isLoginAdminMode && (
          <div className="space-y-3">
            <button onClick={() => { setNewTeamLogo(null); setIsCreateTeamOpen(true); }} className="w-full py-4 border-2 border-dashed border-slate-700 rounded-2xl text-blue-400 font-bold flex items-center justify-center gap-2 hover:border-blue-500 bg-blue-500/5 transition">
              <Plus size={20} /> 새 팀 생성하기
            </button>
            <button onClick={() => setAdminPwdChangeModal(true)} className="w-full py-4 border-2 border-dashed border-slate-700 rounded-2xl text-slate-400 font-bold flex items-center justify-center gap-2 hover:text-white hover:border-slate-500 bg-slate-800/50 transition">
              <Shield size={20} /> 관리자 마스터 비밀번호 변경
            </button>
          </div>
        )}

        {renderCreateTeamModal()}
        {renderEditTeamModal()}
        {renderAdminPwdChangeModal()}
        {renderAuthModal()}
        {renderSystemModals()}
      </div>
    );
  }

  if (appState === 'liveMatch' && liveMatch) {
    const activeTeams = liveState.playingTeams;
    const isExternal = liveMatch.matchType === 'external';
    
    const renderLiveHeader = (title) => (
      <header className="flex justify-between items-center mb-6 pt-2 shrink-0">
        <button onClick={() => setAppState('main')} className="flex items-center gap-1 text-slate-400 hover:text-white font-bold text-sm">
          <ChevronLeft size={20}/> 메인
        </button>
        <h2 className="text-lg font-black text-white">{title}</h2>
        <div className="flex items-center gap-2">
          {!isExternal && (
            <button onClick={() => setAssignmentModal({isOpen: true, match: liveMatch})} className="text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg font-bold border border-slate-600 flex items-center gap-1 hover:bg-slate-700 transition">
              <Users size={14}/> 편성
            </button>
          )}
          <button onClick={() => triggerShare(liveMatch)} className="text-xs bg-yellow-500/20 text-yellow-500 px-3 py-1.5 rounded-lg font-bold border border-yellow-500/30 flex items-center gap-1 hover:bg-yellow-500/30 transition">
            <Share2 size={14}/> 공유
          </button>
        </div>
      </header>
    );

    if (!liveState.isQuarterActive) {
      return (
        <div className="bg-slate-900 text-slate-200 font-sans p-5 sm:p-6 max-w-md mx-auto flex flex-col relative h-[100dvh] overflow-hidden">
          {globalStyles}
          {renderLiveHeader("새 쿼터 준비")}
          <div className="flex-1 flex flex-col justify-center pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-black text-center text-white mb-2">{liveState.currentQuarter}Q 매치업</h2>
            <p className="text-center text-slate-400 mb-10">이번 쿼터에 맞붙을 팀을 확인하세요.</p>
            
            {isExternal ? (
              <div className="flex items-center justify-center gap-4 mb-12">
                <div className={`w-32 border-2 text-white font-black text-xl text-center py-8 rounded-2xl shadow-xl bg-slate-800 border-slate-400`}>
                   {activeTeam?.name || '우리 팀'}
                </div>
                <span className="text-slate-600 font-black italic text-2xl">VS</span>
                <div className={`w-32 border-2 text-white font-black text-xl text-center py-8 rounded-2xl shadow-xl ${TEAM_COLORS['B']}`}>
                   {liveMatch.opponentName}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-4 mb-12">
                <select value={liveState.playingTeams[0]} onChange={(e) => setLiveState({...liveState, playingTeams: [e.target.value, liveState.playingTeams[1]]})} className={`w-28 border-2 text-white font-black text-3xl text-center py-6 rounded-2xl appearance-none shadow-xl outline-none ${liveState.playingTeams[0] === 'A' ? 'bg-slate-800 border-slate-400' : TEAM_COLORS[liveState.playingTeams[0]]}`}>
                  {TEAM_LETTERS.slice(0, liveMatch.teamCount).map(t => <option key={t} value={t} className="bg-slate-900">{t}팀</option>)}
                </select>
                <span className="text-slate-600 font-black italic text-2xl">VS</span>
                <select value={liveState.playingTeams[1]} onChange={(e) => setLiveState({...liveState, playingTeams: [liveState.playingTeams[0], e.target.value]})} className={`w-28 border-2 text-white font-black text-3xl text-center py-6 rounded-2xl appearance-none shadow-xl outline-none ${liveState.playingTeams[1] === 'A' ? 'bg-slate-800 border-slate-400' : TEAM_COLORS[liveState.playingTeams[1]]}`}>
                  {TEAM_LETTERS.slice(0, liveMatch.teamCount).map(t => <option key={t} value={t} className="bg-slate-900">{t}팀</option>)}
                </select>
              </div>
            )}
            
            <button onClick={() => setLiveState({...liveState, isQuarterActive: true})} className="w-full bg-blue-500 hover:bg-blue-400 text-white font-black py-4 rounded-xl text-xl shadow-lg transition">쿼터 시작하기</button>
          </div>

          {renderAssignmentModal()}
          {renderShareModal()}
          {renderHiddenCaptureArea()}
          {renderSystemModals()}
        </div>
      );
    }

    const t1Letter = activeTeams[0];
    const t2Letter = activeTeams[1];
    
    const currentQLogs = (liveMatch.logs || []).filter(l => l.quarter === liveState.currentQuarter);
    const t1QScore = currentQLogs.filter(l => l.teamLetter === t1Letter).length;
    const t2QScore = currentQLogs.filter(l => l.teamLetter === t2Letter).length;
    
    return (
      <div className="bg-slate-900 text-slate-200 font-sans p-5 sm:p-6 max-w-md mx-auto relative flex flex-col h-[100dvh] overflow-hidden animate-in fade-in">
        {globalStyles}
        {renderLiveHeader(`${liveState.currentQuarter}Q 라이브`)}

        <div className="bg-slate-800 rounded-3xl p-6 flex justify-between items-center mb-6 border border-slate-700 shadow-xl relative overflow-hidden shrink-0">
          <div className={`absolute top-0 left-0 w-1/2 h-1.5 bg-current ${TEAM_TEXT_COLORS[t1Letter]}`}></div>
          <div className={`absolute top-0 right-0 w-1/2 h-1.5 bg-current ${TEAM_TEXT_COLORS[t2Letter]}`}></div>
          
          <div className="text-center w-[40%]">
            <div className={`font-black text-[13px] mb-1 truncate ${TEAM_TEXT_COLORS[t1Letter]}`}>{getTeamDisplayName(liveMatch, t1Letter)}</div>
            <div className="text-5xl font-black text-white">{t1QScore}</div>
          </div>
          <div className="text-xl font-black text-slate-600 italic">VS</div>
          <div className="text-center w-[40%]">
            <div className={`font-black text-[13px] mb-1 truncate ${TEAM_TEXT_COLORS[t2Letter]}`}>{getTeamDisplayName(liveMatch, t2Letter)}</div>
            <div className="text-5xl font-black text-white">{t2QScore}</div>
          </div>
        </div>

        <div className="flex gap-4 mb-6 shrink-0">
          <button 
            onClick={() => setGoalFlow({ isOpen: true, step: 1, matchId: null, quarter: null, teamLetter: t1Letter, scorer: null, isPK: false, remark: '', isMissingAdd: false })} 
            className={`flex-1 border-2 py-6 rounded-3xl flex flex-col items-center justify-center gap-2 transition shadow-lg ${t1Letter === 'A' ? 'bg-slate-800 border-slate-400 text-white' : TEAM_COLORS[t1Letter]}`}
          >
            <Trophy size={28} className="fill-current"/>
            <span className="font-black text-sm">{getTeamDisplayName(liveMatch, t1Letter)} 득점</span>
          </button>
          <button 
            onClick={() => setGoalFlow({ isOpen: true, step: 1, matchId: null, quarter: null, teamLetter: t2Letter, scorer: null, isPK: false, remark: '', isMissingAdd: false })} 
            className={`flex-1 border-2 py-6 rounded-3xl flex flex-col items-center justify-center gap-2 transition shadow-lg ${t2Letter === 'A' ? 'bg-slate-800 border-slate-400 text-white' : TEAM_COLORS[t2Letter]}`}
          >
            <Trophy size={28} className="fill-current"/>
            <span className="font-black text-sm">{getTeamDisplayName(liveMatch, t2Letter)} 득점</span>
          </button>
        </div>

        <div className="flex-1 bg-slate-800/40 border border-slate-700/50 rounded-3xl p-4 sm:p-5 pb-8 overflow-y-auto flex flex-col gap-4 hide-scrollbar">
          <div className="flex justify-between items-center mb-2 shrink-0">
             <h3 className="text-sm font-bold text-slate-400 flex items-center gap-2"><List size={16}/> 쿼터별 기록 현황</h3>
             <button onClick={requestEndQuarter} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold text-xs transition border border-slate-600 shadow-sm">현재 쿼터 종료</button>
          </div>
          
          {(liveMatch.quarterScores || []).map(qs => (
            <div key={qs.quarter} className="bg-slate-900 rounded-2xl p-4 border border-slate-800 mb-2 shrink-0">
               <div className="relative flex justify-center items-center border-b border-slate-800 pb-3 mb-3">
                 <span className="absolute left-0 font-bold text-slate-500 text-sm">{qs.quarter}Q</span>
                 <span className="font-bold text-white text-[15px]">
                   <span className={TEAM_TEXT_COLORS[qs.team1]}>{getTeamDisplayName(liveMatch, qs.team1)}</span>
                   <span className="text-slate-500 mx-3">{qs.score1} : {qs.score2}</span> 
                   <span className={TEAM_TEXT_COLORS[qs.team2]}>{getTeamDisplayName(liveMatch, qs.team2)}</span>
                 </span>
               </div>
               <div className="space-y-3">
                 {(liveMatch.logs || []).filter(l => l.quarter === qs.quarter).map(l => {
                    const isLeft = l.teamLetter === qs.team1;
                    return (
                      <div 
                        key={l.id} 
                        onClick={() => isAdmin && openLogEditModal(l, liveMatch)}
                        className={`flex items-start gap-2 w-full ${isLeft ? 'flex-row' : 'flex-row-reverse'} ${isAdmin ? 'cursor-pointer hover:bg-slate-800 p-1.5 rounded-lg transition -mx-1.5 px-1.5' : ''}`}
                      >
                        <span className="text-slate-600 text-[11px] w-8 shrink-0 text-center mt-1">{l.time}</span>
                        <div className={`flex flex-col ${isLeft ? 'items-start' : 'items-end'}`}>
                         <div className="text-white font-bold text-sm flex items-center gap-1.5">
                           <span className={TEAM_TEXT_COLORS[l.teamLetter]}>⚽</span> {l.scorerName}
                           {l.isPK && <span className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded ml-1 border border-red-500/30">PK</span>}
                         </div>
                         {l.remark && <div className="text-[12px] bg-slate-800/80 px-2 py-1 rounded text-slate-300 mt-1 inline-block border border-slate-700">{l.remark}</div>}
                         {l.assistName && (
                           <div className="text-slate-400 mt-1 flex items-center gap-1">
                             <Footprints size={12} className="text-slate-500"/> <span className="text-[13px]">{l.assistName}</span>
                           </div>
                         )}
                        </div>
                      </div>
                    )
                 })}
                 {(liveMatch.logs || []).filter(l => l.quarter === qs.quarter).length === 0 && <div className="text-sm text-slate-500 italic text-center py-2">득점 없음</div>}
               </div>
               {isAdmin && (
                  <div className="flex justify-center mt-4 pt-3 border-t border-slate-800/50">
                    <button onClick={() => setGoalFlow({ isOpen: true, step: 1, matchId: liveMatch.id, quarter: qs.quarter, teamLetter: qs.team1, availableTeams: [qs.team1, qs.team2], scorer: null, isPK: false, remark: '', isMissingAdd: true })} className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 px-3 py-1.5 rounded-lg flex items-center gap-1 transition">
                      <Plus size={14}/> 누락된 득점 추가
                    </button>
                  </div>
               )}
            </div>
          ))}

          <div className="bg-slate-900 rounded-2xl p-4 border border-blue-500/30 shadow-lg relative overflow-hidden shrink-0">
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-transparent"></div>
             <div className="relative flex justify-center items-center border-b border-slate-800 pb-3 mb-4">
               <span className="absolute left-0 font-black text-blue-400 flex items-center gap-1">
                 <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                 {liveState.currentQuarter}Q <span className="text-[10px] text-slate-400 font-normal ml-0.5">진행중</span>
               </span>
               <span className="font-bold text-white text-[15px]">
                   <span className={TEAM_TEXT_COLORS[t1Letter]}>{getTeamDisplayName(liveMatch, t1Letter)}</span>
                   <span className="text-slate-500 mx-3">{t1QScore} : {t2QScore}</span> 
                   <span className={TEAM_TEXT_COLORS[t2Letter]}>{getTeamDisplayName(liveMatch, t2Letter)}</span>
               </span>
             </div>
             <div className="space-y-4">
               {currentQLogs.map(l => {
                 const isLeft = l.teamLetter === t1Letter;
                 return (
                   <div 
                     key={l.id} 
                     onClick={() => isAdmin && openLogEditModal(l, liveMatch)}
                     className={`flex items-start gap-2 w-full ${isLeft ? 'flex-row' : 'flex-row-reverse'} ${isAdmin ? 'cursor-pointer hover:bg-slate-800 p-1.5 rounded-lg transition -mx-1.5 px-1.5' : ''}`}
                   >
                     <span className="text-slate-500 text-[11px] w-8 shrink-0 text-center mt-1">{l.time}</span>
                     <div className={`flex flex-col ${isLeft ? 'items-start' : 'items-end'}`}>
                       <div className="text-white font-bold text-sm flex items-center gap-1.5">
                         <span className={TEAM_TEXT_COLORS[l.teamLetter]}>⚽</span> {l.scorerName}
                         {l.isPK && <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded ml-1 border border-red-500/30">PK</span>}
                       </div>
                       {l.remark && <div className="text-[12px] bg-slate-800/80 px-2 py-1 rounded text-slate-300 mt-1 inline-block border border-slate-700">{l.remark}</div>}
                       {l.assistName && (
                         <div className="text-slate-400 mt-1 flex items-center gap-1">
                           <Footprints size={12} className="text-slate-500"/> <span className="text-[13px]">{l.assistName}</span>
                         </div>
                       )}
                     </div>
                   </div>
                 )
               })}
               {currentQLogs.length === 0 && <div className="text-sm text-slate-500 italic text-center py-4">아직 득점이 없습니다.</div>}
             </div>
          </div>
          <div className="h-6 shrink-0 w-full"></div>
        </div>
        
        {/* 팝업 렌더링 영역 */}
        {renderAssignmentModal()}
        {renderShareModal()}
        {renderHiddenCaptureArea()}
        {renderGoalFlowModal()}
        {renderLogEditModal()}
        {renderSystemModals()}
      </div>
    );
  }

  // 메인 탭 반환 (matches, schedule, stats, tactics, roster)
  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans pb-24 max-w-md mx-auto relative shadow-xl flex flex-col">
      {globalStyles}
      <header className="px-6 py-4 border-b border-slate-800 bg-slate-900 sticky top-0 z-[60] flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center border border-slate-700 text-lg overflow-hidden shrink-0">
            {activeTeam?.logo?.startsWith('data:image') ? <img src={activeTeam?.logo} alt="logo" className="w-full h-full object-cover" /> : activeTeam?.logo}
          </div>
          <div>
            <h1 className="text-lg font-black text-white italic tracking-tight">MATCHBOARD</h1>
            <div className="text-[10px] text-slate-500 flex items-center gap-2">
              <span className={isAdmin ? "text-blue-400 font-bold" : ""}>{activeTeam?.name} {isAdmin ? '(관리자)' : '(조회모드)'}</span>
              {isAdmin && (
                <button onClick={() => { setTeamSettingsLogo(activeTeam?.logo); setTeamSettingsModal(true); }} className="text-slate-400 hover:text-white transition">
                  <Settings size={12}/>
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
           {!isAdmin && <button onClick={() => setAuthModal({isOpen: true, type: 'adminMode'})} className="text-[10px] font-bold bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-700">관리자 전환</button>}
           {isAdmin && <button onClick={() => setIsAdmin(false)} className="text-[10px] font-bold bg-blue-500/20 text-blue-400 px-3 py-1.5 rounded-lg border border-blue-500/30 hover:bg-blue-500/30">조회모드 전환</button>}
           <button onClick={logout} className="text-[10px] font-bold bg-red-500/10 text-red-400 px-3 py-1.5 rounded-lg border border-red-500/20 hover:bg-red-500/20">로그아웃</button>
        </div>
      </header>

      <main className="p-6 flex-1 flex flex-col min-h-0">
        
        {/* === 1. 경기 Tab === */}
        {activeTab === 'matches' && (
          <div className="space-y-6 animate-in fade-in flex-1 overflow-y-auto hide-scrollbar">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-black text-white">팀 경기</h2>
              {isAdmin && (
                <button onClick={() => openMatchModal(null)} className="bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 shadow-lg hover:bg-blue-600 transition">
                  <Plus size={16}/> 새 경기
                </button>
              )}
            </div>

            <div className="flex justify-between items-center bg-slate-800 p-3 rounded-2xl border border-slate-700">
              <button onClick={prevMonth} className="p-2 text-slate-400 hover:text-white"><ChevronLeft size={20}/></button>
              <h3 className="text-lg font-black text-white">{viewDate.getFullYear()}년 {viewDate.getMonth() + 1}월</h3>
              <button onClick={nextMonth} className="p-2 text-slate-400 hover:text-white"><ChevronRight size={20}/></button>
            </div>

            {monthlyMatches.length === 0 ? (
              <div className="text-center py-10 text-slate-500 border border-slate-800 rounded-2xl">이번 달에 등록된 경기가 없습니다.</div>
            ) : (
              <div className="space-y-4 mt-4">
                {scheduledThisMonth.map(m => (
                  <div key={m.id} className="bg-slate-800 p-5 rounded-2xl border border-blue-500/30 relative overflow-hidden group">
                    {isAdmin && (
                      <div className="absolute top-3 right-3 flex gap-2">
                        <button onClick={() => openMatchModal(m)} className="text-slate-400 hover:text-white p-1"><Edit size={16}/></button>
                        <button onClick={() => requestDeleteMatch(m.id)} className="text-slate-400 hover:text-red-400 p-1"><Trash2 size={16}/></button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-blue-400 font-bold mb-2">
                      <span className="bg-blue-500/20 px-2 py-0.5 rounded text-[10px]">예정</span> {m.date} {formatTimeAmPm(m.time)}
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${m.matchType === 'external' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}>
                        {m.matchType === 'external' ? '교류전' : '자체전'}
                      </span>
                      <div className="text-lg font-bold text-white">{m.location}</div>
                    </div>
                    <div className="text-xs text-slate-400 mb-4 mt-1">
                      {m.matchType === 'external' ? `우리 팀 VS ${m.opponentName}` : `총 ${m.teamCount}팀 파전`} • 총 {m.totalQuarters}쿼터 • 참석 {(m.attendees || []).length}명
                    </div>
                    
                    <div className="flex gap-2">
                      {m.matchType !== 'external' && (
                        <button onClick={() => handleActionClick('assign', m)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl text-sm flex justify-center items-center gap-2 transition">
                          <Users size={16}/> 편성
                        </button>
                      )}
                      <button onClick={() => handleActionClick('start', m)} className={`bg-blue-500 text-white font-bold py-3 rounded-xl text-sm flex justify-center items-center gap-2 shadow-lg hover:bg-blue-600 transition ${m.matchType === 'external' ? 'w-full' : 'flex-1'}`}>
                        {(m.logs || []).length > 0 ? <Activity size={16}/> : <Play size={16} className="fill-current"/>} 
                        {(m.logs || []).length > 0 ? '이어하기' : '기록 시작'}
                      </button>
                    </div>
                  </div>
                ))}

                {completedThisMonthWithStandings.map(m => {
                  return (
                    <div key={m.id} onClick={() => { setDetailModalMatchId(m.id); setDetailModal({isOpen: true, match: m}); }} className="bg-slate-900 p-5 rounded-2xl border border-slate-700 opacity-80 hover:opacity-100 hover:border-slate-500 cursor-pointer transition relative group">
                      <div className="absolute top-3 right-3 flex gap-2">
                        <button onClick={(e) => { e.stopPropagation(); triggerShare(m); }} className="text-yellow-500 hover:text-yellow-400 p-1"><Share2 size={16}/></button>
                        {isAdmin && <button onClick={(e) => { e.stopPropagation(); requestDeleteMatch(m.id); }} className="text-slate-500 hover:text-red-400 p-1"><Trash2 size={16}/></button>}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-400 font-bold mb-2">
                        <CheckCircle size={14}/> {m.date} (종료)
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${m.matchType === 'external' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}>
                          {m.matchType === 'external' ? '교류전' : '자체전'}
                        </span>
                        <div className="text-base font-bold text-slate-300">{m.location}</div>
                      </div>
                      
                      <div className="bg-slate-800 rounded-xl p-3 mb-3 border border-slate-700/50">
                        <div className="text-xs text-slate-400 mb-2 font-bold border-b border-slate-700 pb-2 flex justify-between">
                          <span>순위표</span>
                          <span className="text-blue-400 font-normal">상세보기 &gt;</span>
                        </div>
                        <table className="w-full text-xs text-center">
                          <thead>
                            <tr className="text-slate-500 font-bold">
                              <th className="pb-2">순위</th><th className="pb-2 text-left">팀</th><th className="pb-2">승점</th><th className="pb-2">승</th><th className="pb-2">무</th><th className="pb-2">패</th><th className="pb-2">득</th><th className="pb-2">실</th><th className="pb-2">득실</th>
                            </tr>
                          </thead>
                          <tbody>
                            {m.standings.map((st, index) => (
                              <tr key={st.team} className="border-t border-slate-700/50">
                                <td className={`py-2 font-black ${index === 0 ? 'text-yellow-400' : 'text-slate-400'}`}>{index + 1}</td>
                                <td className={`py-2 text-left font-bold ${TEAM_TEXT_COLORS[st.team]}`}>{getTeamDisplayName(m, st.team)}</td>
                                <td className="py-2 text-blue-400 font-black">{st.pts}</td>
                                <td className="py-2 text-white">{st.w}</td>
                                <td className="py-2 text-slate-400">{st.d}</td>
                                <td className="py-2 text-slate-400">{st.l}</td>
                                <td className="py-2 text-white">{st.gf}</td>
                                <td className="py-2 text-slate-400">{st.ga}</td>
                                <td className="py-2 text-white">{st.gd > 0 ? `+${st.gd}` : st.gd}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="mb-3">
                        <div className="flex justify-between items-center text-xs text-slate-400 mb-2 font-bold px-1">
                          <span>쿼터별 스코어 보드</span>
                        </div>
                        <div 
                          className="flex gap-3 overflow-x-auto hide-scrollbar pb-2 cursor-grab active:cursor-grabbing"
                          onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; }}
                        >
                          {(m.quarterScores || []).map(qs => (
                            <div key={qs.quarter} className="flex-shrink-0 bg-slate-900 border border-slate-700/50 rounded-xl p-3 flex flex-col items-center justify-center shadow-inner min-w-[150px]">
                              <div className="text-[10px] font-black text-slate-500 mb-3 bg-slate-800 px-3 py-1 rounded-full">{qs.quarter}Q</div>
                              <div className="flex items-center justify-between w-full px-2 gap-3">
                                <div className="flex flex-col items-center flex-1 w-0">
                                  <span className={`text-[11px] font-bold text-center whitespace-nowrap mb-1 ${TEAM_TEXT_COLORS[qs.team1]}`}>{getTeamDisplayName(m, qs.team1)}</span>
                                  <span className="text-white font-black text-2xl leading-none">{qs.score1}</span>
                                </div>
                                <div className="text-slate-600 font-black text-sm pb-1 shrink-0">:</div>
                                <div className="flex flex-col items-center flex-1 w-0">
                                  <span className={`text-[11px] font-bold text-center whitespace-nowrap mb-1 ${TEAM_TEXT_COLORS[qs.team2]}`}>{getTeamDisplayName(m, qs.team2)}</span>
                                  <span className="text-white font-black text-2xl leading-none">{qs.score2}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                          {(m.quarterScores || []).length === 0 && <div className="text-xs text-slate-600 px-1">기록 없음</div>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* === 2. 스케쥴 (달력) Tab === */}
        {activeTab === 'schedule' && (
          <div className="space-y-6 animate-in fade-in flex-1 overflow-y-auto hide-scrollbar">
            <h2 className="text-xl font-black text-white">팀 스케쥴</h2>

            <div className="flex justify-between items-center bg-slate-800 p-3 rounded-2xl border border-slate-700">
              <button onClick={prevMonth} className="p-2 text-slate-400 hover:text-white"><ChevronLeft size={20}/></button>
              <h3 className="text-lg font-black text-white">{viewDate.getFullYear()}년 {viewDate.getMonth() + 1}월</h3>
              <button onClick={nextMonth} className="p-2 text-slate-400 hover:text-white"><ChevronRight size={20}/></button>
            </div>

            <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 shadow-sm">
                <div className="grid grid-cols-7 gap-1 text-center mb-2">
                    {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                        <div key={d} className={`text-[10px] font-bold ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-500'}`}>{d}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {renderCalendarDays()}
                </div>
            </div>

            <div className="mt-6 space-y-3">
                <h3 className="text-sm font-bold text-slate-400 px-1 border-b border-slate-800 pb-2">이달의 일정 목록</h3>
                {monthlyMatches.length === 0 ? (
                    <div className="text-center py-6 text-slate-600 text-sm">일정이 없습니다.</div>
                ) : (
                    monthlyMatches.sort((a,b) => a.date.localeCompare(b.date)).map(m => (
                        <div key={m.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex items-center gap-3">
                           <div className="flex flex-col items-center justify-center bg-slate-900 w-12 h-12 rounded-lg border border-slate-700 shrink-0">
                               <span className="text-[10px] text-slate-500">{m.date.split('-')[1]}월</span>
                               <span className="text-lg font-black text-white">{m.date.split('-')[2]}</span>
                           </div>
                           <div className="flex-1 min-w-0">
                               <div className="flex items-center gap-2 mb-0.5">
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${m.status === 'completed' ? 'bg-slate-700 text-slate-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                        {m.status === 'completed' ? '종료' : '예정'}
                                    </span>
                                    <span className="text-sm font-bold text-white truncate">{m.location}</span>
                               </div>
                               <div className="text-[11px] text-slate-400 truncate">
                                    {formatTimeAmPm(m.time)} • {m.matchType === 'external' ? `vs ${m.opponentName}` : `${m.teamCount}팀 자체전`}
                               </div>
                           </div>
                        </div>
                    ))
                )}
            </div>
          </div>
        )}

        {/* === 3. 통계 (Stats) Tab === */}
        {activeTab === 'stats' && (
          <div className="space-y-6 animate-in fade-in flex-1 overflow-y-auto hide-scrollbar">
            <h2 className="text-xl font-black text-white">월간 팀 통계</h2>

            <div className="flex justify-between items-center bg-slate-800 p-3 rounded-2xl border border-slate-700">
              <button onClick={prevMonth} className="p-2 text-slate-400 hover:text-white"><ChevronLeft size={20}/></button>
              <h3 className="text-lg font-black text-white">{viewDate.getFullYear()}년 {viewDate.getMonth() + 1}월</h3>
              <button onClick={nextMonth} className="p-2 text-slate-400 hover:text-white"><ChevronRight size={20}/></button>
            </div>

            {monthlyStats.length === 0 ? (
              <div className="text-center py-10 text-slate-500 border border-slate-800 rounded-2xl text-sm">해당 월에 종료된 경기 데이터가 없습니다.</div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 flex flex-col items-center text-center shadow-sm overflow-hidden">
                    <span className="text-[10px] font-bold text-slate-400 mb-2">이달의 득점왕</span>
                    <span className="text-2xl mb-1">⚽</span>
                    {(() => {
                      const maxGoals = Math.max(...monthlyStats.map(s => s.goals), 0);
                      const topScorers = monthlyStats.filter(s => s.goals === maxGoals && s.goals > 0);
                      const topText = topScorers.length > 1 ? `${topScorers[0].name} 외 ${topScorers.length - 1}명` : (topScorers[0]?.name || '-');
                      return (
                        <>
                          <span className="text-[13px] font-black text-white leading-tight mb-0.5" style={{ wordBreak: 'keep-all' }}>{topText}</span>
                          <span className="text-xs font-bold text-blue-400">{maxGoals > 0 ? `${maxGoals}골` : ''}</span>
                        </>
                      );
                    })()}
                  </div>
                  <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 flex flex-col items-center text-center shadow-sm overflow-hidden">
                    <span className="text-[10px] font-bold text-slate-400 mb-2">이달의 도움왕</span>
                    <span className="text-2xl mb-1">👟</span>
                    {(() => {
                      const maxAssists = Math.max(...monthlyStats.map(s => s.assists), 0);
                      const topAssists = monthlyStats.filter(s => s.assists === maxAssists && s.assists > 0);
                      const topText = topAssists.length > 1 ? `${topAssists[0].name} 외 ${topAssists.length - 1}명` : (topAssists[0]?.name || '-');
                      return (
                        <>
                          <span className="text-[13px] font-black text-white leading-tight mb-0.5" style={{ wordBreak: 'keep-all' }}>{topText}</span>
                          <span className="text-xs font-bold text-blue-400">{maxAssists > 0 ? `${maxAssists}도움` : ''}</span>
                        </>
                      );
                    })()}
                  </div>
                  <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 flex flex-col items-center text-center shadow-sm overflow-hidden">
                    <span className="text-[10px] font-bold text-slate-400 mb-2">이달의 참석왕</span>
                    <span className="text-2xl mb-1">🔥</span>
                    {(() => {
                      const maxCaps = Math.max(...monthlyStats.map(s => s.caps), 0);
                      const topCaps = monthlyStats.filter(s => s.caps === maxCaps && s.caps > 0);
                      const topText = topCaps.length > 1 ? `${topCaps[0].name} 외 ${topCaps.length - 1}명` : (topCaps[0]?.name || '-');
                      return (
                        <>
                          <span className="text-[13px] font-black text-white leading-tight mb-0.5" style={{ wordBreak: 'keep-all' }}>{topText}</span>
                          <span className="text-xs font-bold text-blue-400">{maxCaps > 0 ? `${maxCaps}회` : ''}</span>
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 shadow-sm">
                  <table className="w-full text-sm text-center">
                    <thead>
                      <tr className="text-slate-500 font-bold border-b border-slate-700">
                        <th className="pb-3 text-left pl-2">선수명</th>
                        <th className="pb-3">참석</th>
                        <th className="pb-3">득점</th>
                        <th className="pb-3">도움</th>
                        <th className="pb-3">포인트</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyStats.filter(s => s.caps > 0).map((st, i) => (
                        <tr key={st.id} className="border-b border-slate-700/50 last:border-0">
                          <td className="py-3 text-left pl-2 font-bold text-white">{st.name}</td>
                          <td className="py-3 text-slate-300">{st.caps}</td>
                          <td className="py-3 text-blue-400 font-bold">{st.goals}</td>
                          <td className="py-3 text-emerald-400 font-bold">{st.assists}</td>
                          <td className="py-3 text-yellow-400 font-black">{st.goals + st.assists}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {monthlyStats.filter(s => s.caps > 0).length === 0 && (
                     <div className="text-center text-xs text-slate-500 mt-4">데이터가 없습니다.</div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* === 4. 전술 Tab === */}
        {activeTab === 'tactics' && (
          <div className="animate-in fade-in flex-1 flex flex-col min-h-0 relative pb-2 -mx-2 px-2">
            
            <div className="flex justify-between items-center shrink-0 mb-3">
              <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-lg border border-slate-700">
                 <button onClick={() => { setPitchType('full'); saveHistory(getInitialTacticsTokens('full'), []); clearFrames(); }} className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition ${pitchType === 'full' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
                   풀 코트
                 </button>
                 <button onClick={() => { setPitchType('half'); saveHistory(getInitialTacticsTokens('half'), []); clearFrames(); }} className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition ${pitchType === 'half' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
                   하프
                 </button>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={handleUndo} disabled={pastState.length === 0 || isPlaying} className="p-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg disabled:opacity-30 hover:bg-slate-700 transition"><Undo size={14}/></button>
                <button onClick={handleRedo} disabled={futureState.length === 0 || isPlaying} className="p-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg disabled:opacity-30 hover:bg-slate-700 transition"><Redo size={14}/></button>
                <button onClick={() => { setPitchType(pitchType); saveHistory(getInitialTacticsTokens(pitchType), []); clearFrames(); }} className="px-2.5 py-1.5 bg-slate-800 text-slate-400 rounded-lg font-bold text-[11px] border border-slate-700 hover:bg-slate-700 transition">초기화</button>
                <button onClick={triggerTacticShare} className="px-2.5 py-1.5 bg-yellow-500/20 text-yellow-500 rounded-lg font-bold text-[11px] border border-yellow-500/30 hover:bg-yellow-500/30 transition flex items-center gap-1"><Share2 size={12}/> 캡처</button>
              </div>
            </div>

            <div className="flex justify-between items-center bg-slate-900 rounded-2xl p-1 border border-slate-700 shrink-0 mb-1 gap-1">
               <button onClick={() => setCurrentTool('move')} className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition ${currentTool === 'move' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800'}`}>
                 <MousePointer2 size={15}/>
                 <span className="text-[11px] font-bold">이동</span>
               </button>
               <button onClick={() => setCurrentTool('arrow')} className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition ${currentTool === 'arrow' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800'}`}>
                 <MoveUpRight size={15}/>
                 <span className="text-[11px] font-bold">화살표</span>
               </button>
               <button onClick={() => setCurrentTool('pass')} className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition ${currentTool === 'pass' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800'}`}>
                 <Spline size={15}/>
                 <span className="text-[11px] font-bold">패스</span>
               </button>
               <button onClick={() => setCurrentTool('zone')} className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition ${currentTool === 'zone' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800'}`}>
                 <Square size={15}/>
                 <span className="text-[11px] font-bold">지역</span>
               </button>
               <button onClick={() => setCurrentTool('erase')} className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition ${currentTool === 'erase' ? 'bg-red-500 text-white shadow' : 'text-slate-400 hover:bg-slate-800'}`}>
                 <Eraser size={15}/>
                 <span className="text-[11px] font-bold">지우기</span>
               </button>
            </div>

            <div className="flex-1 w-full flex justify-center items-center min-h-0 relative pb-6 mt-1">
              <div 
                ref={boardRef}
                style={{ maxHeight: '100%', maxWidth: '100%', aspectRatio: pitchType === 'full' ? '2/3' : '4/3', touchAction: (currentTool !== 'move' || isPlaying || isAutoRecording || draggingToken) ? 'none' : 'auto' }}
                onPointerDown={handleBoardPointerDown}
                onPointerMove={handleBoardPointerMove}
                onPointerUp={handleBoardPointerUp}
                onPointerLeave={handleBoardPointerUp}
                className={`relative bg-emerald-700 border-2 ${isAutoRecording ? 'border-red-500 shadow-[inset_0_0_20px_rgba(239,68,68,0.7)]' : isPlaying ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.6)]' : 'border-white/80 shadow-inner'} overflow-hidden tactic-board select-none w-full mx-auto transition-colors duration-300`}
              >
                {pitchType === 'full' && (
                  <>
                    <div className="absolute top-1/2 left-0 w-full border-t-2 border-white/60 pointer-events-none"></div>
                    <div className="absolute top-1/2 left-1/2 w-20 h-20 sm:w-28 sm:h-28 border-2 border-white/60 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
                    <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-white/80 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
                    
                    <div className="absolute top-0 left-1/2 w-3/5 h-[15%] border-2 border-t-0 border-white/60 -translate-x-1/2 pointer-events-none"></div>
                    <div className="absolute top-0 left-1/2 w-[25%] h-[6%] border-2 border-t-0 border-white/60 -translate-x-1/2 pointer-events-none"></div>
                    <div className="absolute top-[11%] left-1/2 w-1.5 h-1.5 bg-white/80 rounded-full -translate-x-1/2 pointer-events-none"></div>
                    <div className="absolute top-[15%] left-1/2 w-12 h-6 border-b-2 border-white/60 rounded-b-full -translate-x-1/2 pointer-events-none"></div>

                    <div className="absolute bottom-0 left-1/2 w-3/5 h-[15%] border-2 border-b-0 border-white/60 -translate-x-1/2 pointer-events-none"></div>
                    <div className="absolute bottom-0 left-1/2 w-[25%] h-[6%] border-2 border-b-0 border-white/60 -translate-x-1/2 pointer-events-none"></div>
                    <div className="absolute bottom-[11%] left-1/2 w-1.5 h-1.5 bg-white/80 rounded-full -translate-x-1/2 pointer-events-none"></div>
                    <div className="absolute bottom-[15%] left-1/2 w-12 h-6 border-t-2 border-white/60 rounded-t-full -translate-x-1/2 pointer-events-none"></div>
                  </>
                )}

                {pitchType === 'half' && (
                  <>
                    <div className="absolute top-0 left-0 w-full border-t-2 border-white/60 pointer-events-none"></div>
                    <div className="absolute top-0 left-1/2 w-32 h-32 border-2 border-white/60 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>

                    <div className="absolute bottom-0 left-1/2 w-[70%] h-[40%] border-2 border-b-0 border-white/60 -translate-x-1/2 pointer-events-none"></div>
                    <div className="absolute bottom-0 left-1/2 w-[35%] h-[15%] border-2 border-b-0 border-white/60 -translate-x-1/2 pointer-events-none"></div>
                    <div className="absolute bottom-[30%] left-1/2 w-2 h-2 bg-white/80 rounded-full -translate-x-1/2 pointer-events-none"></div>
                    <div className="absolute bottom-[40%] left-1/2 w-20 h-10 border-t-2 border-white/60 rounded-t-full -translate-x-1/2 pointer-events-none"></div>
                  </>
                )}

                <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                  <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="#FACC15" />
                    </marker>
                    <marker id="passhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="#60A5FA" />
                    </marker>
                  </defs>
                  
                  <line ref={svgArrowRef} stroke="#FACC15" strokeWidth="4" markerEnd="url(#arrowhead)" style={{display: 'none'}} />
                  <line ref={svgPassRef} stroke="#60A5FA" strokeWidth="4" strokeDasharray="8,8" markerEnd="url(#passhead)" style={{display: 'none'}} />
                  <rect ref={svgZoneRef} fill="rgba(59, 130, 246, 0.3)" stroke="#3B82F6" strokeWidth="3" style={{display: 'none'}} />

                  {drawings.filter(Boolean).map(d => {
                    const isEraseMode = currentTool === 'erase' && !isPlaying;
                    const pointerClass = isEraseMode ? 'pointer-events-auto cursor-pointer hover:stroke-red-500 hover:stroke-[5px] transition-all' : 'transition-all duration-1000';
                    
                    if (d.type === 'arrow') {
                      return <line key={d.id} x1={`${d.start.x}%`} y1={`${d.start.y}%`} x2={`${d.end.x}%`} y2={`${d.end.y}%`} stroke="#FACC15" strokeWidth="4" markerEnd="url(#arrowhead)" className={pointerClass} onPointerDown={(e) => handleEraseDrawing(e, d.id)} />
                    }
                    if (d.type === 'pass') {
                      return <line key={d.id} x1={`${d.start.x}%`} y1={`${d.start.y}%`} x2={`${d.end.x}%`} y2={`${d.end.y}%`} stroke="#60A5FA" strokeWidth="4" strokeDasharray="8,8" markerEnd="url(#passhead)" className={pointerClass} onPointerDown={(e) => handleEraseDrawing(e, d.id)} />
                    }
                    if (d.type === 'zone') {
                      const x = Math.min(d.start.x, d.end.x);
                      const y = Math.min(d.start.y, d.end.y);
                      const w = Math.abs(d.start.x - d.end.x);
                      const h = Math.abs(d.start.y - d.end.y);
                      const rectClass = isEraseMode ? 'pointer-events-auto cursor-pointer hover:fill-red-500/30 hover:stroke-red-500 transition-all' : 'transition-all duration-1000';
                      return <rect key={d.id} x={`${x}%`} y={`${y}%`} width={`${w}%`} height={`${h}%`} fill="rgba(59, 130, 246, 0.3)" stroke="#3B82F6" strokeWidth="3" className={rectClass} onPointerDown={(e) => handleEraseDrawing(e, d.id)} />
                    }
                    return null;
                  })}
                </svg>

                {tacticTokens.map(t => (
                  <div
                    key={t.id}
                    id={`token-${t.id}`}
                    onPointerDown={(e) => handleTokenPointerDown(e, t)}
                    style={{ left: `${t.x}%`, top: `${t.y}%`, transform: 'translate(-50%, -50%)', touchAction: 'none' }}
                    className={`absolute rounded-full flex flex-col items-center justify-center font-black transition-transform duration-75 text-[10px] sm:text-[11px] will-change-transform 
                      ${isPlaying ? 'transition-none pointer-events-none' : (draggingToken === t.id ? 'transition-none scale-125 z-50 opacity-90 cursor-grabbing' : 'transition-transform duration-100 scale-100 z-30 cursor-grab')}
                      ${currentTool !== 'move' && !isPlaying ? 'pointer-events-none z-20' : ''}
                      ${t.team === 'A' ? 'w-8 h-8 sm:w-9 sm:h-9 bg-red-600 text-white border border-red-800 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.5),_0_2px_5px_rgba(0,0,0,0.5)]' : ''}
                      ${t.team === 'B' ? 'w-8 h-8 sm:w-9 sm:h-9 bg-blue-600 text-white border border-blue-800 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.5),_0_2px_5px_rgba(0,0,0,0.5)]' : ''}
                      ${t.team === 'ball' ? 'w-6 h-6 sm:w-7 sm:h-7 bg-white text-black shadow-[inset_0_-1px_3px_rgba(0,0,0,0.3),_0_3px_6px_rgba(0,0,0,0.6)] text-[16px]' : ''}
                    `}
                  >
                    <span>{t.team === 'ball' ? t.label : t.position}</span>
                    {t.name && (
                      <span className="absolute top-[120%] text-[10px] sm:text-[11px] font-bold text-white bg-black/80 px-2 py-0.5 rounded-full shadow-md whitespace-nowrap z-40 pointer-events-none tracking-tight border border-white/20">
                        {t.name}
                      </span>
                    )}
                  </div>
                ))}
                
                {isPlaying && (
                  <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-black px-2 py-1 rounded-md animate-pulse z-30 shadow-md flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></div> 재생 중
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex flex-col gap-2 shrink-0 border-t border-slate-800 pt-2">
               {animationFrames.length === 0 && !isAutoRecording && (
                 <p className="text-[10px] text-yellow-400 font-bold text-center animate-pulse tracking-wide my-1">💡 [자동 녹화]를 켜고 선수를 움직이면 자동으로 저장됩니다!</p>
               )}
               {isAutoRecording && (
                 <p className="text-[10px] text-red-400 font-bold text-center animate-pulse tracking-wide my-1">🔴 녹화 중입니다. 선수를 이동하거나 선을 그리세요!</p>
               )}
               <div className="flex items-center gap-2 bg-slate-900 rounded-2xl p-1 border border-slate-700">
                 <div className="bg-slate-800 px-2 py-2 rounded-xl text-xs font-black text-slate-300 border border-slate-700 shadow-inner flex items-center gap-1 shrink-0 w-[55px] justify-center">
                    {animationFrames.length}컷
                 </div>
                 <button onClick={toggleAutoRecord} disabled={isPlaying} className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow disabled:opacity-50 ${isAutoRecording ? 'bg-slate-700 text-red-400 border border-red-500/50 animate-pulse' : 'bg-red-500 hover:bg-red-400 text-white'}`}>
                    <Video size={14}/> {isAutoRecording ? '녹화 중지' : '자동 녹화'}
                 </button>
                 <button onClick={playAnimation} disabled={isPlaying || animationFrames.length < 2 || isAutoRecording} className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow disabled:opacity-50">
                    <PlayCircle size={14}/> 재생
                 </button>
                 <button onClick={exportAnimationToVideo} disabled={isPlaying || animationFrames.length < 2 || isAutoRecording} className="flex-1 py-2.5 bg-[#FEE500] hover:bg-[#FEE500]/90 text-slate-900 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 shadow disabled:opacity-50">
                    <Share2 size={14}/> 영상공유
                 </button>
                 <button onClick={clearFrames} disabled={isPlaying || animationFrames.length === 0} className="w-10 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl flex items-center justify-center transition disabled:opacity-50 shrink-0">
                    <Trash2 size={14}/>
                 </button>
               </div>

               <div className="flex gap-2">
                 <div className="flex-1 flex items-center justify-between bg-red-500/5 border border-red-500/20 rounded-xl p-1 pl-3">
                   <span className="text-[11px] font-bold text-red-400">A팀 선수</span>
                   <div className="flex items-center gap-0.5">
                     <button onClick={() => handleUpdatePlayerCount('A', tacticTokens.filter(t=>t.team==='A').length - 1)} disabled={isPlaying} className="w-7 h-7 flex items-center justify-center bg-slate-700/50 text-red-400 rounded-lg hover:bg-slate-600 transition font-black text-sm disabled:opacity-50">-</button>
                     <input type="number" value={tacticTokens.filter(t=>t.team==='A').length === 0 ? '' : tacticTokens.filter(t=>t.team==='A').length} onChange={(e) => handleUpdatePlayerCount('A', e.target.value === '' ? 0 : parseInt(e.target.value, 10))} disabled={isPlaying} className="w-7 text-center bg-transparent text-white text-[13px] font-black outline-none disabled:opacity-50" />
                     <button onClick={() => handleUpdatePlayerCount('A', tacticTokens.filter(t=>t.team==='A').length + 1)} disabled={isPlaying} className="w-7 h-7 flex items-center justify-center bg-slate-700/50 text-red-400 rounded-lg hover:bg-slate-600 transition font-black text-sm disabled:opacity-50">+</button>
                   </div>
                 </div>
                 <div className="flex-1 flex items-center justify-between bg-blue-500/5 border border-blue-500/20 rounded-xl p-1 pl-3">
                   <span className="text-[11px] font-bold text-blue-400">B팀 선수</span>
                   <div className="flex items-center gap-0.5">
                     <button onClick={() => handleUpdatePlayerCount('B', tacticTokens.filter(t=>t.team==='B').length - 1)} disabled={isPlaying} className="w-7 h-7 flex items-center justify-center bg-slate-700/50 text-blue-400 rounded-lg hover:bg-slate-600 transition font-black text-sm disabled:opacity-50">-</button>
                     <input type="number" value={tacticTokens.filter(t=>t.team==='B').length === 0 ? '' : tacticTokens.filter(t=>t.team==='B').length} onChange={(e) => handleUpdatePlayerCount('B', e.target.value === '' ? 0 : parseInt(e.target.value, 10))} disabled={isPlaying} className="w-7 text-center bg-transparent text-white text-[13px] font-black outline-none disabled:opacity-50" />
                     <button onClick={() => handleUpdatePlayerCount('B', tacticTokens.filter(t=>t.team==='B').length + 1)} disabled={isPlaying} className="w-7 h-7 flex items-center justify-center bg-slate-700/50 text-blue-400 rounded-lg hover:bg-slate-600 transition font-black text-sm disabled:opacity-50">+</button>
                   </div>
                 </div>
               </div>
            </div>
          </div>
        )}

        {/* === 5. 명단 Tab === */}
        {activeTab === 'roster' && (
          <div className="space-y-4 animate-in fade-in flex-1 overflow-y-auto hide-scrollbar">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-black text-white">팀 명단</h2>
              {isAdmin && (
                <div className="flex gap-2">
                  <button onClick={requestResetStats} className="text-xs bg-red-500/10 text-red-400 px-3 py-1.5 rounded-lg font-bold border border-red-500/30 flex items-center gap-1 hover:bg-red-500/20 transition">
                    <RotateCcw size={12}/> 스탯 초기화
                  </button>
                  <button onClick={() => setRosterModal({isOpen: true, player: null})} className="text-xs bg-slate-800 text-blue-400 px-3 py-1.5 rounded-lg font-bold border border-blue-500/30 flex items-center gap-1 hover:bg-slate-700 transition">
                    <Plus size={14}/> 선수 추가
                  </button>
                </div>
              )}
            </div>
            {calculatedPlayersList.length === 0 && (
              <div className="text-center py-8 text-slate-500 border border-slate-800 rounded-2xl text-sm">등록된 선수가 없습니다.</div>
            )}
            <div className="space-y-2">
              {calculatedPlayersList.map(p => (
                <div key={p.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center group shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-600 flex items-center justify-center font-black text-slate-400">{p.birthYear}</div>
                    <div>
                      <div className="font-bold text-white text-lg">{p.name}</div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[11px] bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-slate-400">누적 참석 <strong className="text-blue-400">{p.trueCaps || 0}</strong></span>
                        <span className="text-[11px] bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-slate-400">⚽ <strong className="text-white">{p.trueGoals || 0}</strong></span>
                        <span className="text-[11px] bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-slate-400">👟 <strong className="text-white">{p.trueAssists || 0}</strong></span>
                      </div>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <button onClick={() => setRosterModal({isOpen: true, player: p})} className="p-2 text-slate-400 hover:text-white bg-slate-700 rounded-lg transition"><Edit size={16}/></button>
                      <button onClick={() => requestDeleteRoster(p.id)} className="p-2 text-slate-400 hover:text-red-400 bg-slate-700 rounded-lg transition"><Trash2 size={16}/></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 w-full max-w-md bg-slate-900 border-t border-slate-800 flex justify-around p-2 pb-6 z-[60]">
        <button onClick={() => setActiveTab('matches')} className={`flex flex-col items-center p-2 flex-1 ${activeTab === 'matches' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
          <List size={20} className="mb-1" />
          <span className="text-[10px] font-bold">경기</span>
        </button>
        <button onClick={() => setActiveTab('schedule')} className={`flex flex-col items-center p-2 flex-1 ${activeTab === 'schedule' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
          <Calendar size={20} className="mb-1" />
          <span className="text-[10px] font-bold">일정</span>
        </button>
        <button onClick={() => setActiveTab('stats')} className={`flex flex-col items-center p-2 flex-1 ${activeTab === 'stats' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
          <BarChart2 size={20} className="mb-1" />
          <span className="text-[10px] font-bold">통계</span>
        </button>
        <button onClick={() => setActiveTab('tactics')} className={`flex flex-col items-center p-2 flex-1 ${activeTab === 'tactics' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
          <Target size={20} className="mb-1" />
          <span className="text-[10px] font-bold">전술</span>
        </button>
        <button onClick={() => setActiveTab('roster')} className={`flex flex-col items-center p-2 flex-1 ${activeTab === 'roster' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
          <Users size={20} className="mb-1" />
          <span className="text-[10px] font-bold">명단</span>
        </button>
      </nav>

      {/* ============================================================================ */}
      {/* 팝업 모달 영역 */}
      {/* ============================================================================ */}
      {renderDetailModal()}
      {renderMatchModalForm()}
      {renderAssignmentModal()}
      {renderRosterModalForm()}
      {renderAuthModal()}
      {renderTeamSettingsModal()}
      {renderTokenEditModal()}
      {renderSystemModals()}
      {renderShareModal()}
      {renderGoalFlowModal()}
      {renderLogEditModal()}
      {renderHiddenCaptureArea()}
    </div>
  );
}