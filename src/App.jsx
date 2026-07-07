import React, { useState, useMemo, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, where } from 'firebase/firestore';
import { 
  Calendar, Users, BarChart2, Plus, 
  MapPin, Clock, Trophy, Shield, Lock, 
  ChevronRight, ChevronLeft, X, Play, Edit, Trash2, CheckCircle, Activity, List, LogOut, Share2, MessageCircle, Footprints, Settings
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
// 상수 및 헬퍼
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
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        canvas.width = width;
        canvas.height = height;
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
    if (window.html2canvas) {
      resolve(window.html2canvas);
      return;
    }
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

  const safeQuarterScores = match.quarterScores || [];
  safeQuarterScores.forEach(qs => {
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

// 24시간 형식(HH:MM)을 오전/오후 형식으로 변환
const formatTimeAmPm = (timeStr) => {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? '오후' : '오전';
  const formattedHour = hour % 12 || 12;
  return `${ampm} ${formattedHour}:${m}`;
};

// 오늘 날짜 기본값 생성
const getTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [appState, setAppState] = useState('login'); 
  const [activeTab, setActiveTab] = useState('matches'); 
  const [isAdmin, setIsAdmin] = useState(false); 
  const [adminPassword, setAdminPassword] = useState('admin');
  const [isLoaded, setIsLoaded] = useState(false);

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
  const [shareModal, setShareModal] = useState({ isOpen: false, step: 1, data: null, file: null, imgUrl: null });

  const [liveMatchId, setLiveMatchId] = useState(null);
  const [liveState, setLiveState] = useState({ currentQuarter: 1, playingTeams: ['A', 'B'], isQuarterActive: false });
  
  const [goalFlow, setGoalFlow] = useState({ 
    isOpen: false, step: 1, matchId: null, quarter: null, teamLetter: null, 
    availableTeams: [], scorer: null, isPK: false, remark: '', isMissingAdd: false 
  });
  
  const [logEditModal, setLogEditModal] = useState({ isOpen: false, match: null, log: null });
  const [manualGoalModal, setManualGoalModal] = useState({ isOpen: false, match: null, quarterQs: null });
  const [manualGoalTeam, setManualGoalTeam] = useState('A');

  const activeTeam = useMemo(() => teams.find(t => t.id === activeTeamId), [teams, activeTeamId]);
  const currentTeamPlayers = useMemo(() => players.filter(p => p.teamId === activeTeamId), [players, activeTeamId]);
  const currentTeamMatches = useMemo(() => matches.filter(m => m.teamId === activeTeamId), [matches, activeTeamId]);
  const liveMatch = useMemo(() => matches.find(m => m.id === liveMatchId), [matches, liveMatchId]);
  const detailMatch = useMemo(() => matches.find(m => m.id === detailModalMatchId), [matches, detailModalMatchId]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) setUser(currentUser);
      else signInAnonymously(auth).catch(err => console.error(err));
    });

    const unsubTeams = onSnapshot(collection(db, 'teams'), snap => {
      setTeams(snap.docs.map(d => d.data()));
      setIsLoaded(true); 
    });

    return () => {
      unsubscribeAuth();
      unsubTeams();
    };
  }, []);

  useEffect(() => {
    if (!activeTeamId) {
      setPlayers([]);
      setMatches([]);
      return;
    }

    const qPlayers = query(collection(db, 'players'), where('teamId', '==', activeTeamId));
    const unsubPlayers = onSnapshot(qPlayers, snap => setPlayers(snap.docs.map(d => d.data())));

    const qMatches = query(collection(db, 'matches'), where('teamId', '==', activeTeamId));
    const unsubMatches = onSnapshot(qMatches, snap => setMatches(snap.docs.map(d => d.data())));

    return () => {
      unsubPlayers();
      unsubMatches();
    };
  }, [activeTeamId]);

  const getTeamDisplayName = (match, letter) => {
    if (!match || !letter) return `${letter || ''}팀`;
    if (match.matchType === 'external') {
      if (letter === 'A') return activeTeam?.name || '우리 팀';
      if (letter === 'B') return match.opponentName || '상대 팀';
    }
    return `${letter}팀`;
  };

  const viewYearMonth = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;
  
  const monthlyMatches = useMemo(() => {
    return currentTeamMatches.filter(m => m.date.startsWith(viewYearMonth));
  }, [currentTeamMatches, viewYearMonth]);

  const scheduledThisMonth = useMemo(() => monthlyMatches.filter(m => m.status === 'scheduled').sort((a,b) => a.date.localeCompare(b.date)), [monthlyMatches]);
  
  const completedThisMonthWithStandings = useMemo(() => {
    return monthlyMatches
      .filter(m => m.status === 'completed')
      .sort((a,b) => b.date.localeCompare(a.date))
      .map(m => ({ ...m, standings: calculateStandings(m) }));
  }, [monthlyMatches]);

  const matchesByDate = useMemo(() => {
    const map = {};
    monthlyMatches.forEach(m => {
      if (!map[m.date]) map[m.date] = [];
      map[m.date].push(m);
    });
    return map;
  }, [monthlyMatches]);

  const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));

  const openMatchModal = (match) => {
    setMatchTypeForm(match?.matchType || 'internal');
    setMatchModal({ isOpen: true, match });
  };

  // [수정] 기기별 날짜 파싱 오류를 완벽 방지하는 로직 적용
  const handleActionClick = (action, match) => {
    let matchDateTime = new Date();
    if (match.date && match.time) {
      const [year, month, day] = match.date.split('-');
      const [hours, minutes] = match.time.split(':');
      matchDateTime = new Date(year, month - 1, day, hours, minutes);
    }
    const now = new Date();
    
    if (!isAdmin && matchDateTime > now) {
      setSystemAlert({
        isOpen: true, 
        message: `해당 기능은 경기 시간(${match.date} ${formatTimeAmPm(match.time)}) 이후,\n또는 관리자만 이용할 수 있습니다.`
      });
      return;
    }

    if (action === 'assign') setAssignmentModal({ isOpen: true, match });
    if (action === 'start') startLiveMatch(match);
  };

  const handleAuthSubmit = (e) => {
    e.preventDefault();
    const pwd = e.target.password.value;
    if (authModal.type === 'loginAdminAuth') {
      if (pwd === adminPassword) {
        setIsLoginAdminMode(true);
        setAuthModal({ isOpen: false });
      } else setSystemAlert({ isOpen: true, message: '시스템 관리자 비밀번호가 틀렸습니다.' });
    } else if (authModal.type === 'adminCreate') {
      if (pwd === adminPassword) {
        setAuthModal({ isOpen: false });
        setIsCreateTeamOpen(true);
      } else setSystemAlert({ isOpen: true, message: '시스템 관리자 비밀번호가 틀렸습니다.' });
    } else if (authModal.type === 'adminMode') {
      if (pwd === (activeTeam?.adminPassword || 'admin')) {
        setIsAdmin(true);
        setAuthModal({ isOpen: false });
      } else setSystemAlert({ isOpen: true, message: '팀 관리자 비밀번호가 틀렸습니다.' });
    } else if (authModal.type === 'teamLogin') {
      if (pwd === authModal.targetTeam.password) {
        setActiveTeamId(authModal.targetTeam.id);
        setIsAdmin(false); 
        setAppState('main');
        setAuthModal({ isOpen: false });
      } else setSystemAlert({ isOpen: true, message: '팀 비밀번호가 틀렸습니다.' });
    }
  };

  const logout = () => {
    setActiveTeamId(null);
    setIsAdmin(false);
    setAppState('login');
    setAuthModal({ isOpen: false, type: '', targetTeam: null });
  };

  const handleAdminPwdChange = (e) => {
    e.preventDefault();
    setAdminPassword(e.target.newAdminPwd.value);
    setAdminPwdChangeModal(false);
    setSystemAlert({ isOpen: true, message: '마스터 비밀번호가 성공적으로 변경되었습니다.' });
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    const newTeamId = 't' + Date.now();
    const newTeam = {
      id: newTeamId,
      name: e.target.teamName.value,
      password: e.target.password.value,
      adminPassword: e.target.adminPassword.value,
      logo: newTeamLogo || '⚽'
    };
    await setDoc(doc(db, 'teams', newTeamId), newTeam);
    setIsCreateTeamOpen(false);
    setNewTeamLogo(null);
  };

  const handleEditTeam = async (e) => {
    e.preventDefault();
    const updatedTeam = {
      ...editTeamModal.team,
      name: e.target.teamName.value,
      password: e.target.password.value,
      adminPassword: e.target.adminPassword.value,
      logo: editTeamLogo || editTeamModal.team.logo
    };
    await setDoc(doc(db, 'teams', updatedTeam.id), updatedTeam);
    setEditTeamModal({ isOpen: false, team: null });
    setSystemAlert({ isOpen: true, message: '팀 정보가 수정되었습니다.' });
  };

  const requestDeleteTeam = (id) => {
    setSystemConfirm({
      isOpen: true,
      message: '정말 이 팀을 삭제하시겠습니까? 관련 일정이 모두 삭제됩니다.',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'teams', id));
      }
    });
  };

  const handleTeamSettingsSave = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const updatedTeam = {
      ...activeTeam,
      name: fd.get('name'),
      password: fd.get('password'),
      adminPassword: fd.get('teamAdminPassword'),
      logo: teamSettingsLogo || activeTeam.logo
    };
    await setDoc(doc(db, 'teams', activeTeamId), updatedTeam);
    setTeamSettingsModal(false);
    setSystemAlert({isOpen: true, message: '팀 설정이 성공적으로 저장되었습니다.'});
  };

  const saveMatch = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const safeAttendees = currentTeamPlayers.filter(p => fd.get(`attendee_${p.id}`)).map(p => p.id);
    
    const matchType = matchTypeForm;
    const opponentName = matchType === 'external' ? fd.get('opponentName') : '';
    const teamCount = matchType === 'external' ? 2 : parseInt(fd.get('teamCount'));

    const newAssignments = { ...(matchModal.match?.teamAssignments || {}) };
    safeAttendees.forEach(pId => { 
      if (matchType === 'external') newAssignments[pId] = 'A'; 
      else if (!newAssignments[pId]) newAssignments[pId] = 'A'; 
    });

    const matchId = matchModal.match?.id || 'm' + Date.now().toString();
    const newMatch = {
      ...matchModal.match,
      id: matchId,
      teamId: activeTeamId,
      date: fd.get('date'),
      time: fd.get('time'),
      location: fd.get('location'),
      matchType,
      opponentName,
      teamCount,
      totalQuarters: parseInt(fd.get('totalQuarters')),
      attendees: safeAttendees,
      teamAssignments: newAssignments,
      teamHistory: matchModal.match?.teamHistory || {},
      scores: matchModal.match?.scores || { A: 0, B: 0, C: 0, D: 0 },
      quarterScores: matchModal.match?.quarterScores || [],
      logs: matchModal.match?.logs || [],
      status: matchModal.match?.status || 'scheduled'
    };

    await setDoc(doc(db, 'matches', matchId), newMatch);
    setMatchModal({ isOpen: false, match: null });
  };

  const requestDeleteMatch = (id) => {
    setSystemConfirm({
      isOpen: true,
      message: '정말 삭제하시겠습니까?',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'matches', id));
        setMatchModal({ isOpen: false, match: null });
      }
    });
  };

  const saveRoster = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const playerId = rosterModal.player?.id || 'p' + Date.now();
    const newPlayer = {
      ...rosterModal.player,
      id: playerId,
      teamId: activeTeamId,
      name: fd.get('name'),
      birthYear: parseInt(fd.get('birthYear')),
      goals: rosterModal.player?.goals || 0,
      assists: rosterModal.player?.assists || 0,
      caps: rosterModal.player?.caps || 0
    };

    await setDoc(doc(db, 'players', playerId), newPlayer);
    setRosterModal({ isOpen: false, player: null });
  };

  const requestDeleteRoster = (id) => {
    setSystemConfirm({
      isOpen: true,
      message: '명단에서 삭제하시겠습니까?',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'players', id));
        setRosterModal({ isOpen: false, player: null });
      }
    });
  };

  const assignTeam = (playerId, teamLetter) => {
    const m = assignmentModal.match;
    if(m) {
      const currentTeam = m.teamAssignments?.[playerId] || 'A';
      if (currentTeam === teamLetter) return;

      const newAssigns = { ...m.teamAssignments, [playerId]: teamLetter };
      const newHistoryMap = { ...(m.teamHistory || {}) };
      const playerHistory = newHistoryMap[playerId] || [currentTeam];
      
      if (playerHistory[playerHistory.length - 1] !== teamLetter) {
          newHistoryMap[playerId] = [...playerHistory, teamLetter];
      }

      const updatedMatch = { 
        ...m, 
        teamAssignments: newAssigns, 
        teamHistory: newHistoryMap 
      };

      setAssignmentModal(prev => ({ 
        ...prev, 
        match: updatedMatch 
      }));

      setDoc(doc(db, 'matches', m.id), updatedMatch).catch(console.error);
    }
  };

  // [수정] 과거 경기들의 데이터가 없을 경우를 대비하여 배열에 대한 방어 로직 추가
  const startLiveMatch = (match) => {
    const safeQuarterScores = match.quarterScores || [];
    const safeLogs = match.logs || [];
    
    const currentQ = safeQuarterScores.length + 1;
    const currentLogs = safeLogs.filter(l => l.quarter === currentQ);

    let playingTeams = ['A', 'B'];
    let isQuarterActive = false;

    if (match.matchType === 'external') {
       playingTeams = ['A', 'B']; 
    } else {
       if (currentLogs.length > 0) {
          const teamsInLogs = [...new Set(currentLogs.map(l => l.teamLetter))];
          if (teamsInLogs.length === 2) playingTeams = teamsInLogs;
          else if (teamsInLogs.length === 1) playingTeams = [teamsInLogs[0], TEAM_LETTERS.find(t => t !== teamsInLogs[0])];
          isQuarterActive = true;
       }
    }

    setLiveMatchId(match.id);
    setLiveState({ currentQuarter: currentQ, playingTeams: playingTeams, isQuarterActive: isQuarterActive });
    setAppState('liveMatch');
  };

  const handleOpponentGoalSubmit = async () => {
    const targetMatchId = goalFlow.matchId || liveMatchId;
    const targetMatch = matches.find(m => m.id === targetMatchId);
    const quarter = goalFlow.quarter || liveState.currentQuarter;
    
    const newLog = {
      id: Date.now(),
      quarter: quarter,
      teamLetter: 'B',
      scorerId: null,
      scorerName: targetMatch.opponentName || '상대팀',
      assistId: null,
      assistName: null,
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute:'2-digit' }),
      isPK: goalFlow.isPK || false,
      remark: goalFlow.remark || ''
    };
    
    const newLogs = [...(targetMatch.logs || []), newLog];
    const newScores = { ...(targetMatch.scores || {}), 'B': ((targetMatch.scores || {})['B'] || 0) + 1 };
    
    let newQuarterScores = [...(targetMatch.quarterScores || [])];
    if (goalFlow.isMissingAdd) {
       const qsIndex = newQuarterScores.findIndex(qs => qs.quarter === quarter);
       if (qsIndex > -1) {
          const qs = newQuarterScores[qsIndex];
          newQuarterScores[qsIndex] = {
             ...qs,
             score2: qs.score2 + 1
          };
       }
    }

    const updatedMatch = { ...targetMatch, scores: newScores, logs: newLogs, quarterScores: newQuarterScores };
    
    await setDoc(doc(db, 'matches', targetMatchId), updatedMatch);
    setGoalFlow({ isOpen: false, step: 1, matchId: null, quarter: null, teamLetter: null, scorer: null, isPK: false, remark: '', isMissingAdd: false });
  };

  const handleOwnGoalSubmit = async (targetTeamLetter, isOurFault = false) => {
    const targetMatchId = goalFlow.matchId || liveMatchId;
    const targetMatch = matches.find(m => m.id === targetMatchId);
    const quarter = goalFlow.quarter || liveState.currentQuarter;
    
    const scorerName = isOurFault ? '우리팀 자책골' : '상대팀 자책골';
    
    const newLog = {
      id: Date.now(),
      quarter: quarter,
      teamLetter: targetTeamLetter,
      scorerId: null,
      scorerName: scorerName,
      assistId: null,
      assistName: null,
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute:'2-digit' }),
      isPK: false,
      remark: goalFlow.remark || ''
    };
    
    const newLogs = [...(targetMatch.logs || []), newLog];
    const newScores = { ...(targetMatch.scores || {}), [targetTeamLetter]: ((targetMatch.scores || {})[targetTeamLetter] || 0) + 1 };
    
    let newQuarterScores = [...(targetMatch.quarterScores || [])];
    if (goalFlow.isMissingAdd) {
       const qsIndex = newQuarterScores.findIndex(qs => qs.quarter === quarter);
       if (qsIndex > -1) {
          const qs = newQuarterScores[qsIndex];
          const isTeam1 = qs.team1 === targetTeamLetter;
          newQuarterScores[qsIndex] = {
             ...qs,
             score1: isTeam1 ? qs.score1 + 1 : qs.score1,
             score2: !isTeam1 ? qs.score2 + 1 : qs.score2
          };
       }
    }

    const updatedMatch = { ...targetMatch, scores: newScores, logs: newLogs, quarterScores: newQuarterScores };
    
    await setDoc(doc(db, 'matches', targetMatchId), updatedMatch);
    setGoalFlow({ isOpen: false, step: 1, matchId: null, quarter: null, teamLetter: null, scorer: null, isPK: false, remark: '', isMissingAdd: false });
  };

  const handleGoalSubmit = async (playerId, teamLetter) => {
    if (goalFlow.step === 1) {
      setGoalFlow({ ...goalFlow, step: 2, teamLetter, scorer: playerId });
    } else {
      const targetMatchId = goalFlow.matchId || liveMatchId;
      const targetMatch = matches.find(m => m.id === targetMatchId);
      const quarter = goalFlow.quarter || liveState.currentQuarter;

      const assistId = playerId;
      
      const newLog = {
        id: Date.now(),
        quarter: quarter,
        teamLetter: goalFlow.teamLetter,
        scorerId: goalFlow.scorer,
        scorerName: players.find(p=>p.id===goalFlow.scorer)?.name || '이름 없음',
        assistId: assistId, 
        assistName: assistId ? players.find(p=>p.id===assistId)?.name : null,
        time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute:'2-digit' }),
        isPK: goalFlow.isPK || false,
        remark: goalFlow.remark || ''
      };
      
      const newLogs = [...(targetMatch.logs || []), newLog];
      const newScores = { ...(targetMatch.scores || {}), [goalFlow.teamLetter]: ((targetMatch.scores || {})[goalFlow.teamLetter] || 0) + 1 };
      
      let newQuarterScores = [...(targetMatch.quarterScores || [])];
      if (goalFlow.isMissingAdd) {
         const qsIndex = newQuarterScores.findIndex(qs => qs.quarter === quarter);
         if (qsIndex > -1) {
            const qs = newQuarterScores[qsIndex];
            const isTeam1 = qs.team1 === goalFlow.teamLetter;
            newQuarterScores[qsIndex] = {
               ...qs,
               score1: isTeam1 ? qs.score1 + 1 : qs.score1,
               score2: !isTeam1 ? qs.score2 + 1 : qs.score2
            };
         }
      }

      const updatedMatch = { ...targetMatch, scores: newScores, logs: newLogs, quarterScores: newQuarterScores };
      
      await setDoc(doc(db, 'matches', targetMatchId), updatedMatch);

      const scorer = players.find(p => p.id === goalFlow.scorer);
      if (scorer) {
        await setDoc(doc(db, 'players', scorer.id), { ...scorer, goals: scorer.goals + 1 });
      }
      
      if (assistId) {
        const assist = players.find(p => p.id === assistId);
        if (assist) {
          await setDoc(doc(db, 'players', assist.id), { ...assist, assists: assist.assists + 1 });
        }
      }

      setGoalFlow({ isOpen: false, step: 1, matchId: null, quarter: null, teamLetter: null, scorer: null, isPK: false, remark: '', isMissingAdd: false });
    }
  };

  const openLogEditModal = (log, match) => {
    if (!isAdmin) return;
    const enrichedLog = { ...log };
    if (!enrichedLog.scorerId && enrichedLog.scorerName) {
         enrichedLog.scorerId = players.find(p => p.name === enrichedLog.scorerName)?.id;
    }
    if (!enrichedLog.assistId && enrichedLog.assistName) {
         enrichedLog.assistId = players.find(p => p.name === enrichedLog.assistName)?.id;
    }
    setLogEditModal({ isOpen: true, match, log: enrichedLog });
  };

  const handleLogEditSave = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const newScorerId = fd.get('scorerId') || null;
    const newAssistId = fd.get('assistId');
    const newIsPK = fd.get('isPK') === 'true';
    const newRemark = fd.get('remark') || '';

    const m = matches.find(match => match.id === logEditModal.match.id);
    const l = logEditModal.log;

    const oldScorerId = l.scorerId;
    const oldAssistId = l.assistId;

    if (oldScorerId !== newScorerId) {
        if (oldScorerId) {
           const p = players.find(p => p.id === oldScorerId);
           if (p) await setDoc(doc(db, 'players', p.id), { ...p, goals: Math.max(0, p.goals - 1) });
        }
        if (newScorerId) {
           const p = players.find(p => p.id === newScorerId);
           if (p) await setDoc(doc(db, 'players', p.id), { ...p, goals: p.goals + 1 });
        }
    }

    if (oldAssistId !== newAssistId) {
        if (oldAssistId) {
           const p = players.find(p => p.id === oldAssistId);
           if (p) await setDoc(doc(db, 'players', p.id), { ...p, assists: Math.max(0, p.assists - 1) });
        }
        if (newAssistId && newAssistId !== 'none') {
           const p = players.find(p => p.id === newAssistId);
           if (p) await setDoc(doc(db, 'players', p.id), { ...p, assists: p.assists + 1 });
        }
    }

    const finalAssistId = newAssistId === 'none' ? null : newAssistId;
    const finalAssistName = finalAssistId ? players.find(p => p.id === finalAssistId)?.name : null;

    const updatedLogs = (m.logs || []).map(log => {
        if (log.id === l.id) {
            return {
                ...log,
                scorerId: newScorerId,
                scorerName: newScorerId ? (players.find(p => p.id === newScorerId)?.name || log.scorerName) : log.scorerName,
                assistId: finalAssistId,
                assistName: finalAssistName,
                isPK: newIsPK,
                remark: newRemark
            };
        }
        return log;
    });

    await setDoc(doc(db, 'matches', m.id), { ...m, logs: updatedLogs });
    setLogEditModal({ isOpen: false, match: null, log: null });
    setSystemAlert({ isOpen: true, message: '득점 기록이 수정되었습니다.' });
  };

  const handleLogDelete = async () => {
    const m = matches.find(match => match.id === logEditModal.match.id);
    const l = logEditModal.log;

    setSystemConfirm({
        isOpen: true,
        message: '정말 이 득점 기록을 삭제하시겠습니까?\n(선수 개인 기록과 팀 점수도 함께 차감됩니다.)',
        onConfirm: async () => {
            if (l.scorerId) {
               const p = players.find(p => p.id === l.scorerId);
               if (p) await setDoc(doc(db, 'players', p.id), { ...p, goals: Math.max(0, p.goals - 1) });
            }
            if (l.assistId) {
               const p = players.find(p => p.id === l.assistId);
               if (p) await setDoc(doc(db, 'players', p.id), { ...p, assists: Math.max(0, p.assists - 1) });
            }

            const updatedLogs = (m.logs || []).filter(log => log.id !== l.id);
            
            let updatedQuarterScores = [...(m.quarterScores || [])];
            const qsIndex = updatedQuarterScores.findIndex(qs => qs.quarter === l.quarter);
            if (qsIndex > -1) {
                const qs = updatedQuarterScores[qsIndex];
                const isTeam1 = qs.team1 === l.teamLetter;
                updatedQuarterScores[qsIndex] = {
                    ...qs,
                    score1: isTeam1 ? Math.max(0, qs.score1 - 1) : qs.score1,
                    score2: !isTeam1 ? Math.max(0, qs.score2 - 1) : qs.score2,
                };
            }

            const updatedScores = { ...(m.scores || {}) };
            if (updatedScores[l.teamLetter] !== undefined) {
                updatedScores[l.teamLetter] = Math.max(0, updatedScores[l.teamLetter] - 1);
            }

            await setDoc(doc(db, 'matches', m.id), { 
                ...m, 
                logs: updatedLogs, 
                scores: updatedScores,
                quarterScores: updatedQuarterScores 
            });
            setLogEditModal({ isOpen: false, match: null, log: null });
            setSystemAlert({ isOpen: true, message: '득점 기록이 삭제되었습니다.' });
        }
    });
  };

  const requestEndQuarter = () => {
    setSystemConfirm({
      isOpen: true,
      message: '현재 쿼터를 종료하시겠습니까?',
      onConfirm: () => {
        endQuarter();
      }
    });
  };

  const endQuarter = async () => {
    const [t1, t2] = liveState.playingTeams;
    const safeLogs = liveMatch.logs || [];
    const qScore1 = safeLogs.filter(l => l.quarter === liveState.currentQuarter && l.teamLetter === t1).length;
    const qScore2 = safeLogs.filter(l => l.quarter === liveState.currentQuarter && l.teamLetter === t2).length;

    const newQuarterScore = { quarter: liveState.currentQuarter, team1: t1, team2: t2, score1: qScore1, score2: qScore2 };
    const updatedMatch = { ...liveMatch, quarterScores: [...(liveMatch.quarterScores || []), newQuarterScore] };
        
    if (liveState.currentQuarter >= liveMatch.totalQuarters) {
       for (const p of players) {
         if ((updatedMatch.attendees || []).includes(p.id)) {
            await setDoc(doc(db, 'players', p.id), { ...p, caps: p.caps + 1 });
         }
       }
       const finalMatch = { ...updatedMatch, status: 'completed' };
       await setDoc(doc(db, 'matches', liveMatchId), finalMatch);
       setAppState('main');
       setLiveMatchId(null);
    } else {
       await setDoc(doc(db, 'matches', liveMatchId), updatedMatch);
       setLiveState(prev => ({ currentQuarter: prev.currentQuarter + 1, playingTeams: ['A', 'B'], isQuarterActive: false }));
    }
  };

  const triggerShare = (data) => {
    setShareModal({ isOpen: true, step: 1, data, file: null, imgUrl: null });

    setTimeout(async () => {
      const captureTarget = document.getElementById('capture-area-hidden');
      if (!captureTarget) return;

      try {
        const html2canvas = await loadHtml2Canvas();
        const canvas = await html2canvas(captureTarget, {
          scale: 2, 
          useCORS: true, 
          backgroundColor: '#0F172A' 
        });

        canvas.toBlob((blob) => {
          if (!blob) return;
          const file = new File([blob], 'matchboard_result.png', { type: 'image/png' });
          const imgUrl = URL.createObjectURL(blob);
          setShareModal(prev => ({ ...prev, step: 2, file, imgUrl }));
        }, 'image/png');
      } catch (err) {
        console.error('캡처 에러:', err);
        setSystemAlert({ isOpen: true, message: '이미지 생성 중 오류가 발생했습니다.' });
        setShareModal({ isOpen: false, step: 1, data: null, file: null, imgUrl: null });
      }
    }, 500); 
  };

  const doActualShare = async () => {
    const file = shareModal.file;
    if (!file) return;

    const fallbackAlert = () => {
      setSystemAlert({ 
        isOpen: true, 
        message: '🚨 카카오톡 브라우저에서는 자동 공유/복사가 제한됩니다.\n\n💡 해결 방법:\n1. 화면의 이미지를 꾹~ 길게 눌러 "이미지 저장"을 하시거나\n2. 우측 하단 ⠇ 메뉴를 눌러 "다른 브라우저로 열기(Safari/Chrome)"를 선택해주세요!' 
      });
    };

    const isKakaotalk = navigator.userAgent.toLowerCase().includes('kakaotalk');
    if (isKakaotalk) {
      fallbackAlert();
      return;
    }

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: 'MATCHBOARD 경기 결과',
          files: [file]
        });
      } catch (error) {
        console.log('공유 취소 또는 에러', error);
        if (error.name !== 'AbortError') fallbackAlert();
      }
    } else {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          const clipboardItem = new ClipboardItem({ 'image/png': file });
          await navigator.clipboard.write([clipboardItem]);
          setSystemAlert({ isOpen: true, message: '결과 이미지가 클립보드에 복사되었습니다!\n채팅창에 붙여넣기(Ctrl+V) 해주세요.' });
        } else {
          throw new Error('Clipboard API 미지원');
        }
      } catch (err) {
        console.error(err);
        fallbackAlert();
      }
    }
  };

  const renderSystemModals = () => (
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
    </>
  );

  const renderShareModal = () => {
    if (!shareModal.isOpen) return null;

    return (
      <div className="fixed inset-0 bg-black/90 flex justify-center items-center p-4 z-[90]">
        <div className="w-full max-w-sm flex flex-col items-center max-h-[90vh]">
          {shareModal.step === 1 ? (
            <div className="bg-slate-800 border border-slate-700 p-6 rounded-3xl w-full shadow-xl flex flex-col items-center text-center animate-in zoom-in-95">
              <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4 mt-8"></div>
              <h2 className="text-lg font-black text-white mb-1">리포트 이미지 생성 중...</h2>
              <p className="text-sm text-slate-400 font-medium mb-8">화면을 캡처하고 있습니다.</p>
            </div>
          ) : (
            <div className="bg-slate-800 border border-slate-700 p-5 rounded-3xl w-full shadow-xl flex flex-col items-center text-center flex-1 min-h-0 animate-in fade-in">
              <h2 className="text-lg font-black text-white flex items-center gap-1 mb-4 shrink-0">
                <MessageCircle size={18} className="text-blue-500"/> 이미지 리포트 생성 완료
              </h2>
              
              <div className="w-full flex-1 overflow-y-auto custom-scrollbar rounded-xl bg-slate-900 p-2 shadow-inner border border-slate-700/50">
                {shareModal.imgUrl && (
                   <img src={shareModal.imgUrl} alt="Preview" className="w-full h-auto rounded-lg shadow-sm" />
                )}
              </div>

              <div className="w-full mt-5 space-y-3 shrink-0">
                <button onClick={doActualShare} className="w-full py-4 bg-[#FEE500] text-slate-900 rounded-2xl font-black text-lg hover:bg-[#FEE500]/90 transition shadow-lg flex items-center justify-center gap-2">
                  <Share2 size={20} />
                  카카오톡 공유하기
                </button>
                <button onClick={() => setShareModal({isOpen: false, step: 1, data: null, file: null, imgUrl: null})} className="w-full py-3 text-slate-400 font-bold hover:text-white transition bg-slate-700/50 rounded-xl border border-slate-700">
                  닫기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderHiddenCaptureArea = () => {
    if (!shareModal.isOpen || !shareModal.data) return null;
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
                   <th className="pb-4">순위</th><th className="pb-4 text-left">팀</th><th className="pb-4 text-blue-400">승점</th><th className="pb-4">승</th><th className="pb-4">무</th><th className="pb-4">패</th><th className="pb-4">득</th><th className="pb-4">실</th><th className="pb-4">득실</th>
                 </tr>
               </thead>
               <tbody>
                 {calculateStandings(shareModal.data).map((st, i) => (
                   <tr key={st.team} className="border-t border-slate-700/30 text-slate-300">
                     <td className={`py-4 font-black ${i === 0 ? 'text-yellow-400' : 'text-slate-400'}`}>{i + 1}</td>
                     <td className={`py-4 font-bold text-left ${TEAM_TEXT_COLORS[st.team]}`}>{getTeamDisplayName(shareModal.data, st.team)}</td>
                     <td className="py-4 font-black text-blue-400">{st.pts}</td>
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
                                {l.assistName && (
                                  <div className="text-slate-500 mt-1 flex items-center gap-1.5">
                                    <Footprints size={14} className="text-slate-500"/> <span className="text-[13px]">{l.assistName}</span>
                                  </div>
                                )}
                                {l.remark && (
                                  <div className={`text-slate-400 mt-1.5 text-[10px] bg-slate-900/50 px-2 py-1 rounded-md border border-slate-700/50 ${isLeft ? 'text-left' : 'text-right'}`}>
                                    {l.remark}
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
                  <span>참석자 편성 명단</span>
                  <span className="text-[11px] font-normal text-slate-500">* ( )는 팀 이동 내역</span>
              </div>
              <div className="space-y-6">
                {TEAM_LETTERS.slice(0, shareModal.data.teamCount).map(teamLetter => {
                  const teamPlayers = players.filter(p => (shareModal.data.attendees || []).includes(p.id) && ((shareModal.data.teamAssignments || {})[p.id] || 'A') === teamLetter);
                  if(teamPlayers.length === 0) return null;
                  return (
                    <div key={teamLetter}>
                      <div className={`text-[14px] font-black mb-3 ${TEAM_TEXT_COLORS[teamLetter]}`}>
                        {getTeamDisplayName(shareModal.data, teamLetter)}
                      </div>
                      <div className="flex flex-wrap gap-2.5">
                        {teamPlayers.map(p => {
                          const history = (shareModal.data.teamHistory || {})[p.id];
                          let historyStr = "";
                          if (history && history.length > 1) {
                              historyStr = ` (${history.join('➔')})`;
                          }
                          return (
                            <div key={p.id} className="bg-slate-900 px-3 py-2 rounded-lg border border-slate-700 text-[13px] text-slate-200 flex items-center shadow-sm">
                              <span className="font-bold text-white">{p.name}</span>
                              {historyStr && <span className="text-slate-500 ml-1.5 tracking-tighter font-medium">{historyStr}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
          </div>

        </div>
      </div>
    );
  };

  const renderCalendarDays = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="p-2" />);
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayMatches = matchesByDate[dateStr] || [];
      
      days.push(
        <div key={day} className="p-2 aspect-square border border-slate-700/50 rounded-xl relative flex flex-col items-center bg-slate-800/30">
          <span className="text-xs font-bold text-slate-300">{day}</span>
          <div className="flex gap-1 mt-1">
            {dayMatches.map((m, idx) => (
              <div key={idx} className={`w-1.5 h-1.5 rounded-full ${m.status === 'completed' ? 'bg-slate-500' : 'bg-blue-400'}`} />
            ))}
          </div>
        </div>
      );
    }
    return days;
  };

  if (appState === 'login') {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-200 font-sans p-6 flex flex-col justify-center max-w-md mx-auto relative">
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

        {authModal.isOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <Lock size={20} className="text-blue-500"/> 
                {authModal.type === 'loginAdminAuth' ? '시스템 관리자 인증' : `${authModal.targetTeam?.name} 로그인`}
              </h2>
              <p className="text-xs text-slate-400 mb-4">{authModal.type === 'teamLogin' ? "팀 조회를 위해 비밀번호를 입력하세요." : "관리자 시스템 마스터 비밀번호를 입력하세요."}</p>
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
        )}

        {isCreateTeamOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
              <h2 className="text-xl font-bold text-white mb-6 text-center">신규 팀 생성</h2>
              <form onSubmit={handleCreateTeam} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2">팀 로고 (이미지 업로드)</label>
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 shrink-0 bg-slate-900 border border-slate-700 rounded-full flex items-center justify-center overflow-hidden text-2xl bg-white/5">
                      {newTeamLogo?.startsWith('data:image') ? <img src={newTeamLogo} alt="Preview" className="w-full h-full object-cover" /> : (newTeamLogo || '⚽')}
                    </div>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={async (e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const compressedLogo = await resizeImage(file);
                          setNewTeamLogo(compressedLogo);
                        }
                      }} 
                      className="text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-500/10 file:text-blue-500 hover:file:bg-blue-500/20 cursor-pointer w-full"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">팀 이름</label>
                  <input type="text" name="teamName" required placeholder="예: 킥오프 FC" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">팀 전용 비밀번호</label>
                  <input type="text" name="password" required placeholder="팀원들과 공유할 조회용 비밀번호" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline