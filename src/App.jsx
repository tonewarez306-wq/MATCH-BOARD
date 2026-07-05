import React, { useState, useMemo, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
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
// 요청하신 컬러 적용 (A:흰색, B:파란색, C:노란색, D:빨간색)
const TEAM_COLORS = {
  'A': 'text-white bg-white/10 border-white/30',
  'B': 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  'C': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  'D': 'text-red-400 bg-red-500/10 border-red-500/30'
};
const TEAM_TEXT_COLORS = { 'A': 'text-white', 'B': 'text-blue-400', 'C': 'text-yellow-400', 'D': 'text-red-400' };

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

  match.quarterScores.forEach(qs => {
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
  const [rosterModal, setRosterModal] = useState({ isOpen: false, player: null });
  const [shareModal, setShareModal] = useState({ isOpen: false, step: 1, data: null, file: null, imgUrl: null });

  const [liveMatchId, setLiveMatchId] = useState(null);
  const [liveState, setLiveState] = useState({ currentQuarter: 1, playingTeams: ['A', 'B'], isQuarterActive: false });
  const [goalFlow, setGoalFlow] = useState({ isOpen: false, step: 1, teamLetter: null, scorer: null, isPK: false, remark: '' });
  const [logEditModal, setLogEditModal] = useState({ isOpen: false, match: null, log: null });

  const [manualGoalModal, setManualGoalModal] = useState({ isOpen: false, match: null, quarterQs: null });
  const [manualGoalTeam, setManualGoalTeam] = useState('A');

  const activeTeam = useMemo(() => teams.find(t => t.id === activeTeamId), [teams, activeTeamId]);
  const currentTeamPlayers = useMemo(() => players.filter(p => p.teamId === activeTeamId), [players, activeTeamId]);
  const currentTeamMatches = useMemo(() => matches.filter(m => m.teamId === activeTeamId), [matches, activeTeamId]);
  const liveMatch = useMemo(() => matches.find(m => m.id === liveMatchId), [matches, liveMatchId]);
  
  const currentDetailMatch = useMemo(() => detailModal.match ? matches.find(m => m.id === detailModal.match.id) : null, [matches, detailModal.match]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) setUser(currentUser);
      else signInAnonymously(auth).catch(err => console.error(err));
    });

    const unsubTeams = onSnapshot(collection(db, 'teams'), snap => {
      setTeams(snap.docs.map(d => d.data()));
      setIsLoaded(true); 
    });
    const unsubPlayers = onSnapshot(collection(db, 'players'), snap => setPlayers(snap.docs.map(d => d.data())));
    const unsubMatches = onSnapshot(collection(db, 'matches'), snap => setMatches(snap.docs.map(d => d.data())));

    return () => {
      unsubscribeAuth();
      unsubTeams();
      unsubPlayers();
      unsubMatches();
    };
  }, []);

  const getTeamDisplayName = (match, letter) => {
    if (!match) return `팀 ${letter}`;
    if (match.matchType === 'external') {
      if (letter === 'A') return activeTeam?.name || '우리 팀';
      if (letter === 'B') return match.opponentName || '상대 팀';
    }
    return `팀 ${letter}`;
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

  const handleActionClick = (action, match) => {
    const matchDateTime = new Date(`${match.date}T${match.time}`);
    const now = new Date();
    
    if (!isAdmin && matchDateTime > now) {
      setSystemAlert({
        isOpen: true, 
        message: `해당 기능은 경기 시간(${match.date} ${match.time}) 이후,\n또는 관리자만 이용할 수 있습니다.`
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
    const attendees = currentTeamPlayers.filter(p => fd.get(`attendee_${p.id}`)).map(p => p.id);
    
    const matchType = matchTypeForm;
    const opponentName = matchType === 'external' ? fd.get('opponentName') : '';
    const teamCount = matchType === 'external' ? 2 : parseInt(fd.get('teamCount'));

    const newAssignments = { ...(matchModal.match?.teamAssignments || {}) };
    attendees.forEach(pId => { 
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
      attendees,
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

  const startLiveMatch = (match) => {
    const currentQ = match.quarterScores.length + 1;
    const currentLogs = match.logs.filter(l => l.quarter === currentQ);

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

  const handleOpponentGoal = async () => {
    const newLog = {
      id: Date.now(),
      quarter: liveState.currentQuarter,
      teamLetter: 'B',
      scorerId: null,
      scorerName: liveMatch.opponentName || '상대팀',
      assistId: null,
      assistName: null,
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute:'2-digit' }),
      isPK: false,
      remark: ''
    };
    
    const newLogs = [...liveMatch.logs, newLog]; 
    const newScores = { ...liveMatch.scores, 'B': liveMatch.scores['B'] + 1 };
    const updatedMatch = { ...liveMatch, scores: newScores, logs: newLogs };
    
    await setDoc(doc(db, 'matches', liveMatchId), updatedMatch);
  };

  const handleGoalSubmit = async (playerId, teamLetter) => {
    if (goalFlow.step === 1) {
      setGoalFlow({ ...goalFlow, step: 2, teamLetter, scorer: playerId });
    } else {
      const assistId = playerId;
      
      const newLog = {
        id: Date.now(),
        quarter: liveState.currentQuarter,
        teamLetter: goalFlow.teamLetter,
        scorerId: goalFlow.scorer,
        scorerName: players.find(p=>p.id===goalFlow.scorer)?.name,
        assistId: assistId,
        assistName: assistId ? players.find(p=>p.id===assistId)?.name : null,
        time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute:'2-digit' }),
        isPK: goalFlow.isPK || false,
        remark: goalFlow.remark || ''
      };
      
      const newLogs = [...liveMatch.logs, newLog];
      const newScores = { ...liveMatch.scores, [goalFlow.teamLetter]: liveMatch.scores[goalFlow.teamLetter] + 1 };
      const updatedMatch = { ...liveMatch, scores: newScores, logs: newLogs };
      
      await setDoc(doc(db, 'matches', liveMatchId), updatedMatch);

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

      setGoalFlow({ isOpen: false, step: 1, teamLetter: null, scorer: null, isPK: false, remark: '' });
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
    const newScorerId = fd.get('scorerId');
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

    const updatedLogs = m.logs.map(log => {
        if (log.id === l.id) {
            return {
                ...log,
                scorerId: newScorerId,
                scorerName: players.find(p => p.id === newScorerId)?.name || log.scorerName,
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

            const updatedLogs = m.logs.filter(log => log.id !== l.id);
            
            let updatedQuarterScores = [...m.quarterScores];
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

            const updatedScores = { ...m.scores };
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

  const handleManualGoalSave = async (e) => {
    e.preventDefault();
    const m = manualGoalModal.match;
    const qs = manualGoalModal.quarterQs;
    const teamLetter = manualGoalTeam;
    const isOpponent = m.matchType === 'external' && teamLetter === 'B';
    
    let newLog = {
        id: Date.now(),
        quarter: qs.quarter,
        teamLetter: teamLetter,
        time: "종료 후 추가", 
        isPK: false,
        remark: ''
    };

    if (isOpponent) {
        newLog.scorerId = null;
        newLog.scorerName = m.opponentName || '상대팀';
        newLog.assistId = null;
        newLog.assistName = null;
    } else {
        const fd = new FormData(e.target);
        const scorerId = fd.get('scorerId');
        const assistId = fd.get('assistId');
        
        newLog.scorerId = scorerId;
        newLog.scorerName = players.find(p => p.id === scorerId)?.name;
        newLog.assistId = assistId === 'none' ? null : assistId;
        newLog.assistName = newLog.assistId ? players.find(p => p.id === assistId)?.name : null;
        newLog.isPK = fd.get('isPK') === 'true';
        newLog.remark = fd.get('remark') || '';

        const scorer = players.find(p => p.id === scorerId);
        if (scorer) await setDoc(doc(db, 'players', scorer.id), { ...scorer, goals: scorer.goals + 1 });
        
        if (newLog.assistId) {
            const assist = players.find(p => p.id === newLog.assistId);
            if (assist) await setDoc(doc(db, 'players', assist.id), { ...assist, assists: assist.assists + 1 });
        }
    }

    const newLogs = [...m.logs, newLog];
    const newScores = { ...m.scores, [teamLetter]: (m.scores[teamLetter] || 0) + 1 };
    
    const newQuarterScores = m.quarterScores.map(q => {
        if (q.quarter === qs.quarter) {
            return {
                ...q,
                score1: q.team1 === teamLetter ? q.score1 + 1 : q.score1,
                score2: q.team2 === teamLetter ? q.score2 + 1 : q.score2,
            };
        }
        return q;
    });

    const updatedMatch = { ...m, logs: newLogs, scores: newScores, quarterScores: newQuarterScores };
    await setDoc(doc(db, 'matches', m.id), updatedMatch);
    
    setManualGoalModal({ isOpen: false, match: null, quarterQs: null });
    setSystemAlert({ isOpen: true, message: '누락된 득점 기록이 추가되었습니다.' });
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
    const qScore1 = liveMatch.logs.filter(l => l.quarter === liveState.currentQuarter && l.teamLetter === t1).length;
    const qScore2 = liveMatch.logs.filter(l => l.quarter === liveState.currentQuarter && l.teamLetter === t2).length;

    const newQuarterScore = { quarter: liveState.currentQuarter, team1: t1, team2: t2, score1: qScore1, score2: qScore2 };
    const updatedMatch = { ...liveMatch, quarterScores: [...liveMatch.quarterScores, newQuarterScore] };
        
    if (liveState.currentQuarter >= liveMatch.totalQuarters) {
       for (const p of players) {
         if (updatedMatch.attendees.includes(p.id)) {
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

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: 'MATCHBOARD 경기 결과',
          files: [file]
        });
      } catch (error) {
        console.log('공유 취소 또는 에러', error);
      }
    } else {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          const clipboardItem = new ClipboardItem({ 'image/png': file });
          await navigator.clipboard.write([clipboardItem]);
          setSystemAlert({ isOpen: true, message: '결과 이미지가 클립보드에 복사되었습니다!\n카카오톡 채팅창에 붙여넣기(Ctrl+V) 해주세요.' });
        } else {
          throw new Error('Clipboard API 미지원');
        }
      } catch (err) {
        console.error(err);
        setSystemAlert({ isOpen: true, message: '현재 기기에서는 자동 복사를 지원하지 않습니다.\n위 화면의 이미지를 꾹 길게 눌러 "이미지 저장" 후 공유해 주세요.' });
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
      <div className="fixed inset-0 bg-black/90 flex justify-center items-center p-4 z-50">
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

  const renderLogEditModal = () => {
    if (!logEditModal.isOpen) return null;
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
                <select name="scorerId" defaultValue={l.scorerId} required className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none">
                  {players.filter(p => m.attendees.includes(p.id) && (m.teamAssignments[p.id] || 'A') === l.teamLetter).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2">도움 (어시스트)</label>
                <select name="assistId" defaultValue={l.assistId || 'none'} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none">
                  <option value="none">도움 없음</option>
                  {players.filter(p => m.attendees.includes(p.id) && (m.teamAssignments[p.id] || 'A') === l.teamLetter).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              
              <label className="flex items-center gap-2 p-3 bg-slate-900 rounded-xl border border-slate-700 cursor-pointer mt-2">
                <input type="checkbox" name="isPK" value="true" defaultChecked={l.isPK || false} className="accent-blue-500 w-4 h-4 rounded" />
                <span className="text-white font-bold text-sm">페널티킥 (PK) 득점 여부</span>
              </label>
              
              <div className="mt-3">
                <label className="block text-xs font-bold text-slate-400 mb-2">비고 (선택사항)</label>
                <input type="text" name="remark" defaultValue={l.remark || ""} placeholder="예: 멋진 프리킥 골" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
              </div>
              
              <div className="flex gap-3 pt-4 border-t border-slate-700 mt-4">
                <button type="button" onClick={() => setLogEditModal({isOpen: false, match: null, log: null})} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button>
                <button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">저장하기</button>
              </div>
              
              <button type="button" onClick={handleLogDelete} className="w-full py-3 mt-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-bold text-sm hover:bg-red-500/20 transition">기록 완전 삭제</button>
            </form>
          )}
        </div>
      </div>
    );
  };

  const renderManualGoalModal = () => {
    if (!manualGoalModal.isOpen) return null;
    const m = manualGoalModal.match;
    const qs = manualGoalModal.quarterQs;
    const isOpponent = m.matchType === 'external' && manualGoalTeam === 'B';

    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[60]">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm shadow-xl border border-slate-700 animate-in zoom-in-95">
          <h2 className="text-xl font-bold text-white mb-4">{qs.quarter}Q 누락 득점 추가</h2>
          
          <div className="flex gap-2 mb-6">
            <button 
              type="button" 
              onClick={() => setManualGoalTeam(qs.team1)} 
              className={`flex-1 py-2 rounded-xl font-bold text-sm transition ${manualGoalTeam === qs.team1 ? TEAM_COLORS[qs.team1] : 'bg-slate-900 text-slate-500 border border-slate-700'}`}
            >
              {getTeamDisplayName(m, qs.team1)}
            </button>
            <button 
              type="button" 
              onClick={() => setManualGoalTeam(qs.team2)} 
              className={`flex-1 py-2 rounded-xl font-bold text-sm transition ${manualGoalTeam === qs.team2 ? TEAM_COLORS[qs.team2] : 'bg-slate-900 text-slate-500 border border-slate-700'}`}
            >
              {getTeamDisplayName(m, qs.team2)}
            </button>
          </div>

          {isOpponent ? (
            <div>
              <p className="text-slate-400 mb-6 text-sm text-center">상대팀의 득점을 추가합니다.</p>
              <div className="flex gap-3">
                <button onClick={() => setManualGoalModal({isOpen: false, match: null, quarterQs: null})} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button>
                <button onClick={handleManualGoalSave} className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">득점 추가</button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleManualGoalSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2">득점자</label>
                <select name="scorerId" required className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none">
                  {players.filter(p => m.attendees.includes(p.id) && (m.teamAssignments[p.id] || 'A') === manualGoalTeam).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2">도움 (어시스트)</label>
                <select name="assistId" defaultValue="none" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none">
                  <option value="none">도움 없음</option>
                  {players.filter(p => m.attendees.includes(p.id) && (m.teamAssignments[p.id] || 'A') === manualGoalTeam).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              
              <label className="flex items-center gap-2 p-3 bg-slate-900 rounded-xl border border-slate-700 cursor-pointer mt-2">
                <input type="checkbox" name="isPK" value="true" className="accent-blue-500 w-4 h-4 rounded" />
                <span className="text-white font-bold text-sm">페널티킥 (PK) 득점 여부</span>
              </label>
              
              <div className="mt-3">
                <label className="block text-xs font-bold text-slate-400 mb-2">비고 (선택사항)</label>
                <input type="text" name="remark" placeholder="예: 멋진 프리킥 골" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
              </div>
              
              <div className="flex gap-3 pt-4 border-t border-slate-700 mt-4">
                <button type="button" onClick={() => setManualGoalModal({isOpen: false, match: null, quarterQs: null})} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button>
                <button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">저장하기</button>
              </div>
            </form>
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
               {new Date(shareModal.data.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} {shareModal.data.time} · 참석 {shareModal.data.attendees?.length || 0}명
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
               {shareModal.data.quarterScores?.length > 0 ? shareModal.data.quarterScores.map(qs => {
                 const qLogs = shareModal.data.logs.filter(l => l.quarter === qs.quarter);
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
                                  {l.isPK && <span className="text-[11px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded ml-1 border border-red-500/30">PK</span>}
                                </div>
                                {l.assistName && (
                                  <div className="text-slate-500 mt-1 flex items-center gap-1.5">
                                    <Footprints size={14} className="text-slate-500"/> <span className="text-[13px]">{l.assistName}</span>
                                  </div>
                                )}
                                {l.remark && (
                                  <div className={`text-slate-400 mt-1.5 text-[11px] bg-slate-900/50 px-2 py-1 rounded-md border border-slate-700/50 ${isLeft ? 'text-left' : 'text-right'}`}>
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
                  const teamPlayers = players.filter(p => shareModal.data.attendees.includes(p.id) && (shareModal.data.teamAssignments[p.id] || 'A') === teamLetter);
                  if(teamPlayers.length === 0) return null;
                  return (
                    <div key={teamLetter}>
                      <div className={`text-[14px] font-black mb-3 ${TEAM_TEXT_COLORS[teamLetter]}`}>
                        {getTeamDisplayName(shareModal.data, teamLetter)}
                      </div>
                      <div className="flex flex-wrap gap-2.5">
                        {teamPlayers.map(p => {
                          const history = shareModal.data.teamHistory?.[p.id];
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
        )}

        {editTeamModal.isOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
              <h2 className="text-xl font-bold text-white mb-6 text-center">팀 정보 수정</h2>
              <form onSubmit={handleEditTeam} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2">팀 로고 변경</label>
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 shrink-0 bg-slate-900 border border-slate-700 rounded-full flex items-center justify-center overflow-hidden text-2xl bg-white/5">
                      {editTeamLogo?.startsWith('data:image') ? <img src={editTeamLogo} alt="Preview" className="w-full h-full object-cover" /> : (editTeamLogo || '⚽')}
                    </div>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={async (e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const compressedLogo = await resizeImage(file);
                          setEditTeamLogo(compressedLogo);
                        }
                      }} 
                      className="text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-500/10 file:text-blue-500 hover:file:bg-blue-500/20 cursor-pointer w-full"
                    />
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
        )}

        {adminPwdChangeModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <Shield size={20} className="text-blue-500"/> 마스터 비밀번호 변경
              </h2>
              <p className="text-xs text-slate-400 mb-6">새로운 시스템 마스터 비밀번호를 입력하세요.</p>
              <form onSubmit={handleAdminPwdChange}>
                <input 
                  type="password" 
                  name="newAdminPwd" 
                  required 
                  autoFocus
                  placeholder="새 마스터 비밀번호"
                  className="w-full bg-slate-900 border border-slate-700 p-4 rounded-xl text-white mb-4 text-center tracking-[0.2em] text-lg font-bold outline-none focus:border-blue-500 transition" 
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAdminPwdChangeModal(false)} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button>
                  <button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">변경하기</button>
                </div>
              </form>
            </div>
          </div>
        )}

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
            <button onClick={() => setAssignmentModal({isOpen: true, match: liveMatch})} className="text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg font-bold border border-slate-600 flex items-center gap-1 hover:bg-slate-700">
              <Users size={14}/> 편성
            </button>
          )}
          <button onClick={() => triggerShare(liveMatch)} className="text-xs bg-yellow-500/20 text-yellow-500 px-3 py-1.5 rounded-lg font-bold border border-yellow-500/30 flex items-center gap-1 hover:bg-yellow-500/30">
            <Share2 size={14}/> 공유
          </button>
        </div>
      </header>
    );

    if (!liveState.isQuarterActive) {
      return (
        <div className="min-h-screen bg-slate-900 text-slate-200 p-4 max-w-md mx-auto flex flex-col relative h-screen">
          {renderLiveHeader("새 쿼터 준비")}
          <div className="flex-1 flex flex-col justify-center pb-20">
            <h2 className="text-3xl font-black text-center text-white mb-2">{liveState.currentQuarter}Q 매치업</h2>
            <p className="text-center text-slate-400 mb-10">이번 쿼터에 맞붙을 팀을 확인하세요.</p>
            
            {isExternal ? (
              <div className="flex items-center justify-center gap-4 mb-12">
                <div className={`w-32 border-4 text-white font-black text-xl text-center py-8 rounded-2xl shadow-xl ${TEAM_COLORS['A']}`}>
                   {activeTeam?.name || '우리 팀'}
                </div>
                <span className="text-slate-600 font-black italic text-2xl">VS</span>
                <div className={`w-32 border-4 text-white font-black text-xl text-center py-8 rounded-2xl shadow-xl ${TEAM_COLORS['B']}`}>
                   {liveMatch.opponentName}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-4 mb-12">
                <select value={liveState.playingTeams[0]} onChange={(e) => setLiveState({...liveState, playingTeams: [e.target.value, liveState.playingTeams[1]]})} className={`w-28 border-4 text-white font-black text-3xl text-center py-6 rounded-2xl appearance-none shadow-xl ${TEAM_COLORS[liveState.playingTeams[0]]} outline-none`}>
                  {TEAM_LETTERS.slice(0, liveMatch.teamCount).map(t => <option key={t} value={t} className="bg-slate-900">팀 {t}</option>)}
                </select>
                <span className="text-slate-600 font-black italic text-2xl">VS</span>
                <select value={liveState.playingTeams[1]} onChange={(e) => setLiveState({...liveState, playingTeams: [liveState.playingTeams[0], e.target.value]})} className={`w-28 border-4 text-white font-black text-3xl text-center py-6 rounded-2xl appearance-none shadow-xl ${TEAM_COLORS[liveState.playingTeams[1]]} outline-none`}>
                  {TEAM_LETTERS.slice(0, liveMatch.teamCount).map(t => <option key={t} value={t} className="bg-slate-900">팀 {t}</option>)}
                </select>
              </div>
            )}
            
            <button onClick={() => setLiveState({...liveState, isQuarterActive: true})} className="w-full bg-blue-500 hover:bg-blue-400 text-white font-black py-4 rounded-xl text-xl shadow-lg transition">쿼터 시작하기</button>
          </div>

          {renderShareModal()}
          {renderHiddenCaptureArea()}
          
          {assignmentModal.isOpen && assignmentModal.match && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
              <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-md border border-slate-700 max-h-[80vh] flex flex-col shadow-xl">
                <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-700">
                  <div><h2 className="text-lg font-bold text-white">참석자 팀 편성</h2></div>
                  <button onClick={() => setAssignmentModal({isOpen: false, match: null})} className="text-white bg-blue-500 px-4 py-2 rounded-xl font-bold">완료</button>
                </div>
                <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                  {currentTeamPlayers.filter(p => assignmentModal.match.attendees.includes(p.id)).map(p => {
                    const currentTeam = assignmentModal.match.teamAssignments[p.id] || 'A';
                    return (
                      <div key={p.id} className="bg-slate-900 p-3 rounded-xl flex justify-between items-center border border-slate-700">
                        <div className="font-bold text-white">{p.name} <span className="text-xs text-slate-500 ml-1">{p.birthYear}</span></div>
                        <div className="flex bg-slate-800 rounded-lg p-1">
                          {TEAM_LETTERS.slice(0, assignmentModal.match.teamCount).map(t => (
                            <button 
                              key={t} onClick={() => assignTeam(p.id, t)}
                              className={`w-8 h-8 flex items-center justify-center text-xs font-black rounded-md transition ${currentTeam === t ? TEAM_COLORS[t] + ' shadow' : 'text-slate-500 hover:text-white'}`}
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
          )}
          {renderSystemModals()}
        </div>
      );
    }

    const t1Letter = activeTeams[0];
    const t2Letter = activeTeams[1];
    
    const currentQLogs = liveMatch.logs.filter(l => l.quarter === liveState.currentQuarter);
    const t1QScore = currentQLogs.filter(l => l.teamLetter === t1Letter).length;
    const t2QScore = currentQLogs.filter(l => l.teamLetter === t2Letter).length;
    
    return (
      <div className="min-h-screen bg-slate-900 text-slate-200 font-sans p-4 max-w-md mx-auto relative flex flex-col h-screen">
        {renderLiveHeader(`${liveState.currentQuarter}Q 라이브`)}

        <div className="bg-slate-800 rounded-3xl p-6 flex justify-between items-center mb-6 border border-slate-700 shadow-xl relative overflow-hidden">
          <div className={`absolute top-0 left-0 w-1/2 h-1 bg-current ${TEAM_TEXT_COLORS[t1Letter]}`}></div>
          <div className={`absolute top-0 right-0 w-1/2 h-1 bg-current ${TEAM_TEXT_COLORS[t2Letter]}`}></div>
          
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
            onClick={() => setGoalFlow({ isOpen: true, step: 1, teamLetter: t1Letter, scorer: null, isPK: false, remark: '' })} 
            className={`flex-1 border-2 py-6 rounded-3xl flex flex-col items-center justify-center gap-2 transition shadow-lg ${TEAM_COLORS[t1Letter]}`}
          >
            <Trophy size={28} className="fill-current"/>
            <span className="font-black text-sm">{getTeamDisplayName(liveMatch, t1Letter)} 득점</span>
          </button>
          <button 
            onClick={() => {
              if (isExternal && t2Letter === 'B') handleOpponentGoal();
              else setGoalFlow({ isOpen: true, step: 1, teamLetter: t2Letter, scorer: null, isPK: false, remark: '' });
            }} 
            className={`flex-1 border-2 py-6 rounded-3xl flex flex-col items-center justify-center gap-2 transition shadow-lg ${TEAM_COLORS[t2Letter]}`}
          >
            <Trophy size={28} className="fill-current"/>
            <span className="font-black text-sm">{isExternal && t2Letter === 'B' ? '+1 점수 추가' : `${getTeamDisplayName(liveMatch, t2Letter)} 득점`}</span>
          </button>
        </div>

        <div className="flex-1 bg-slate-800/50 border border-slate-700 rounded-2xl p-4 overflow-y-auto custom-scrollbar flex flex-col gap-4">
          <div className="flex justify-between items-center mb-1">
             <h3 className="text-sm font-bold text-slate-400 flex items-center gap-2"><List size={16}/> 쿼터별 기록 현황</h3>
             <button onClick={requestEndQuarter} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold text-xs transition border border-slate-600">현재 쿼터 종료</button>
          </div>
          
          {liveMatch.quarterScores.map(qs => (
            <div key={qs.quarter} className="bg-slate-900 rounded-xl p-3 border border-slate-800">
               <div className="relative flex justify-center items-center border-b border-slate-800 pb-2 mb-2">
                 <span className="absolute left-0 font-bold text-slate-500">{qs.quarter}Q</span>
                 <span className="font-bold text-white text-sm">
                   <span className={TEAM_TEXT_COLORS[qs.team1]}>{getTeamDisplayName(liveMatch, qs.team1)}</span>
                   <span className="text-slate-500 mx-3">{qs.score1} : {qs.score2}</span> 
                   <span className={TEAM_TEXT_COLORS[qs.team2]}>{getTeamDisplayName(liveMatch, qs.team2)}</span>
                 </span>
               </div>
               <div className="space-y-3">
                 {liveMatch.logs.filter(l => l.quarter === qs.quarter).map(l => {
                    const isLeft = l.teamLetter === qs.team1;
                    return (
                      <div 
                        key={l.id} 
                        onClick={() => isAdmin && openLogEditModal(l, liveMatch)}
                        className={`flex items-start gap-2 w-full ${isLeft ? 'flex-row' : 'flex-row-reverse'} ${isAdmin ? 'cursor-pointer hover:bg-slate-800 p-1 rounded-lg transition -mx-1 px-1' : ''}`}
                      >
                        <span className="text-slate-600 text-[10px] w-8 shrink-0 text-center">{l.time}</span>
                        <div className={`flex flex-col ${isLeft ? 'items-start' : 'items-end'}`}>
                         <div className="text-white font-bold text-sm flex items-center gap-1">
                           <span className={TEAM_TEXT_COLORS[l.teamLetter]}>⚽</span> {l.scorerName}
                           {l.isPK && <span className="text-[9px] bg-red-500/20 text-red-400 px-1 py-0.5 rounded ml-1 border border-red-500/30">PK</span>}
                         </div>
                         {l.assistName && (
                           <div className="text-slate-400 mt-0.5 flex items-center gap-1">
                             <Footprints size={12} className="text-slate-500"/> <span className="text-xs">{l.assistName}</span>
                           </div>
                         )}
                         {l.remark && (
                           <div className={`text-slate-400 mt-1 text-[10px] bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700 ${isLeft ? 'text-left' : 'text-right'}`}>
                             {l.remark}
                           </div>
                         )}
                        </div>
                      </div>
                    )
                 })}
                 {liveMatch.logs.filter(l => l.quarter === qs.quarter).length === 0 && <div className="text-xs text-slate-600 italic text-center">득점 없음</div>}
                 
                 {isAdmin && (
                    <button 
                       onClick={() => { setManualGoalTeam(qs.team1); setManualGoalModal({ isOpen: true, match: liveMatch, quarterQs: qs }); }} 
                       className="w-full mt-2 py-1.5 border border-slate-700 border-dashed rounded-lg text-xs font-bold text-slate-500 hover:text-white hover:border-slate-500 transition flex items-center justify-center gap-1"
                    >
                       <Plus size={12}/> 누락된 득점 추가
                    </button>
                 )}
               </div>
            </div>
          ))}

          <div className="bg-slate-900 rounded-xl p-3 border border-slate-600 shadow-lg">
             <div className="relative flex justify-center items-center border-b border-slate-800 pb-2 mb-3">
               <span className="absolute left-0 font-black text-white animate-pulse">{liveState.currentQuarter}Q <span className="text-[10px] text-slate-400 font-normal ml-0.5">진행중</span></span>
               <span className="font-bold text-white text-sm">
                   <span className={TEAM_TEXT_COLORS[t1Letter]}>{getTeamDisplayName(liveMatch, t1Letter)}</span>
                   <span className="text-slate-500 mx-3">{t1QScore} : {t2QScore}</span> 
                   <span className={TEAM_TEXT_COLORS[t2Letter]}>{getTeamDisplayName(liveMatch, t2Letter)}</span>
               </span>
             </div>
             <div className="space-y-3">
               {currentQLogs.map(l => {
                 const isLeft = l.teamLetter === t1Letter;
                 return (
                   <div 
                     key={l.id} 
                     onClick={() => isAdmin && openLogEditModal(l, liveMatch)}
                     className={`flex items-start gap-2 w-full ${isLeft ? 'flex-row' : 'flex-row-reverse'} ${isAdmin ? 'cursor-pointer hover:bg-slate-800 p-1 rounded-lg transition -mx-1 px-1' : ''}`}
                   >
                     <span className="text-slate-500 text-[10px] w-8 shrink-0 text-center">{l.time}</span>
                     <div className={`flex flex-col ${isLeft ? 'items-start' : 'items-end'}`}>
                       <div className="text-white font-bold text-sm flex items-center gap-1">
                         <span className={TEAM_TEXT_COLORS[l.teamLetter]}>⚽</span> {l.scorerName}
                         {l.isPK && <span className="text-[9px] bg-red-500/20 text-red-400 px-1 py-0.5 rounded ml-1 border border-red-500/30">PK</span>}
                       </div>
                       {l.assistName && (
                         <div className="text-slate-400 mt-0.5 flex items-center gap-1">
                           <Footprints size={12} className="text-slate-500"/> <span className="text-xs">{l.assistName}</span>
                         </div>
                       )}
                       {l.remark && (
                         <div className={`text-slate-400 mt-1 text-[10px] bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700 ${isLeft ? 'text-left' : 'text-right'}`}>
                           {l.remark}
                         </div>
                       )}
                     </div>
                   </div>
                 )
               })}
               {currentQLogs.length === 0 && <div className="text-xs text-slate-500 italic text-center">아직 득점이 없습니다.</div>}
             </div>
          </div>
        </div>

        {/* Goal Flow Modal */}
        {goalFlow.isOpen && (
          <div className="fixed inset-0 bg-black/90 flex items-end justify-center z-50">
            <div className={`bg-slate-800 p-6 rounded-t-3xl w-full max-w-md max-h-[80vh] flex flex-col border-t-4 animate-in slide-in-from-bottom ${TEAM_COLORS[goalFlow.teamLetter].split(' ')[2]}`}>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <span className={`w-6 h-6 rounded flex items-center justify-center text-sm ${TEAM_COLORS[goalFlow.teamLetter]}`}>{goalFlow.teamLetter}</span>
                  {goalFlow.step === 1 ? '득점자 선택' : '어시스트 선택 (선택사항)'}
                </h2>
                <button onClick={() => setGoalFlow({isOpen: false, step: 1, teamLetter: null, scorer: null, isPK: false, remark: ''})} className="text-slate-400 bg-slate-700 p-2 rounded-full"><X size={20}/></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pb-6 custom-scrollbar">
                
                {goalFlow.step === 1 && (
                   <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 mb-4 space-y-3">
                     <label className="flex items-center gap-2 cursor-pointer">
                       <input 
                          type="checkbox" 
                          checked={goalFlow.isPK || false} 
                          onChange={(e) => setGoalFlow({...goalFlow, isPK: e.target.checked})} 
                          className="accent-blue-500 w-4 h-4 rounded" 
                       />
                       <span className="text-white font-bold text-sm">페널티킥 (PK) 득점</span>
                     </label>
                     <div>
                       <input 
                          type="text" 
                          value={goalFlow.remark || ''} 
                          onChange={(e) => setGoalFlow({...goalFlow, remark: e.target.value})} 
                          placeholder="비고 텍스트 (예: 환상적인 중거리 슛)" 
                          className="w-full bg-slate-800 border border-slate-600 p-2.5 rounded-lg text-white text-sm outline-none focus:border-blue-500 transition" 
                       />
                     </div>
                   </div>
                )}

                {goalFlow.step === 2 && (
                  <button onClick={() => handleGoalSubmit(null, goalFlow.teamLetter)} className="w-full p-4 rounded-xl text-left font-bold border-2 border-dashed border-slate-600 text-slate-400 hover:border-slate-400 mb-4 transition">
                    ❌ 도움 없음 (단독 돌파/상대 자책 등)
                  </button>
                )}
                {players.filter(p => liveMatch.attendees.includes(p.id) && liveMatch.teamAssignments[p.id] === goalFlow.teamLetter)
                  .filter(p => goalFlow.step === 1 || p.id !== goalFlow.scorer)
                  .map(p => (
                  <button key={p.id} onClick={() => handleGoalSubmit(p.id, goalFlow.teamLetter)} className="w-full p-4 bg-slate-900 rounded-xl flex items-center gap-4 hover:bg-slate-700 border border-slate-700 transition">
                    <span className="font-bold text-lg text-white flex-1 text-left">{p.name}</span>
                    <span className="text-xs text-slate-500">{p.birthYear}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {assignmentModal.isOpen && assignmentModal.match && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-md border border-slate-700 max-h-[80vh] flex flex-col shadow-xl">
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-700">
                <div><h2 className="text-lg font-bold text-white">참석자 팀 편성</h2></div>
                <button onClick={() => setAssignmentModal({isOpen: false, match: null})} className="text-white bg-blue-500 px-4 py-2 rounded-xl font-bold">완료</button>
              </div>
              <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                {currentTeamPlayers.filter(p => assignmentModal.match.attendees.includes(p.id)).map(p => {
                  const currentTeam = assignmentModal.match.teamAssignments[p.id] || 'A';
                  return (
                    <div key={p.id} className="bg-slate-900 p-3 rounded-xl flex justify-between items-center border border-slate-700">
                      <div className="font-bold text-white">{p.name} <span className="text-xs text-slate-500 ml-1">{p.birthYear}</span></div>
                      <div className="flex bg-slate-800 rounded-lg p-1">
                        {TEAM_LETTERS.slice(0, assignmentModal.match.teamCount).map(t => (
                          <button 
                            key={t} onClick={() => assignTeam(p.id, t)}
                            className={`w-8 h-8 flex items-center justify-center text-xs font-black rounded-md transition ${currentTeam === t ? TEAM_COLORS[t] + ' shadow' : 'text-slate-500 hover:text-white'}`}
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
        )}

        {renderHiddenCaptureArea()}
        {renderManualGoalModal()}
        {renderLogEditModal()}
        {renderSystemModals()}
        {renderShareModal()}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans pb-24 max-w-md mx-auto relative shadow-xl">
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      
      <header className="px-6 py-4 border-b border-slate-800 bg-slate-900 sticky top-0 z-10 flex justify-between items-center">
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

      <main className="p-6">
        
        {/* === 1. 경기 Tab === */}
        {activeTab === 'matches' && (
          <div className="space-y-6 animate-in fade-in">
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
                      <span className="bg-blue-500/20 px-2 py-0.5 rounded text-[10px]">예정</span> {m.date} {m.time}
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${m.matchType === 'external' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}>
                        {m.matchType === 'external' ? '교류전' : '자체전'}
                      </span>
                      <div className="text-lg font-bold text-white">{m.location}</div>
                    </div>
                    <div className="text-xs text-slate-400 mb-4 mt-1">
                      {m.matchType === 'external' ? `우리 팀 VS ${m.opponentName}` : `${m.teamCount}팀 파전`} • 총 {m.totalQuarters}쿼터 • 참석 {m.attendees.length}명
                    </div>
                    
                    <div className="flex gap-2">
                      {m.matchType !== 'external' && (
                        <button onClick={() => handleActionClick('assign', m)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl text-sm flex justify-center items-center gap-2 transition">
                          <Users size={16}/> 편성
                        </button>
                      )}
                      <button onClick={() => handleActionClick('start', m)} className={`bg-blue-500 text-white font-bold py-3 rounded-xl text-sm flex justify-center items-center gap-2 shadow-lg hover:bg-blue-600 transition ${m.matchType === 'external' ? 'w-full' : 'flex-1'}`}>
                        {m.logs.length > 0 ? <Activity size={16}/> : <Play size={16} className="fill-current"/>} 
                        {m.logs.length > 0 ? '이어하기' : '기록 시작'}
                      </button>
                    </div>
                  </div>
                ))}

                {completedThisMonthWithStandings.map(m => {
                  return (
                    <div key={m.id} onClick={() => setDetailModal({isOpen: true, match: m})} className="bg-slate-900 p-5 rounded-2xl border border-slate-700 opacity-80 hover:opacity-100 hover:border-slate-500 cursor-pointer transition relative group">
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
                              <th className="pb-2">순위</th><th className="pb-2 text-left">팀</th><th className="pb-2 text-blue-400">승점</th><th className="pb-2">승</th><th className="pb-2">무</th><th className="pb-2">패</th><th className="pb-2">득</th><th className="pb-2">실</th><th className="pb-2">득실</th>
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
                          {m.quarterScores.map(qs => (
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
                          {m.quarterScores.length === 0 && <div className="text-xs text-slate-600 px-1">기록 없음</div>}
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
          <div className="space-y-6 animate-in fade-in">
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
                                    {m.time} • {m.matchType === 'external' ? `vs ${m.opponentName}` : `${m.teamCount}팀 자체전`}
                               </div>
                           </div>
                        </div>
                    ))
                )}
            </div>
          </div>
        )}

        {/* === 3. 명단 Tab === */}
        {activeTab === 'roster' && (
          <div className="space-y-4 animate-in fade-in">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-black text-white">팀 명단</h2>
              {isAdmin && (
                <button onClick={() => setRosterModal({isOpen: true, player: null})} className="text-xs bg-slate-800 text-blue-400 px-3 py-1.5 rounded-lg font-bold border border-blue-500/30 flex items-center gap-1 hover:bg-slate-700 transition">
                  <Plus size={14}/> 선수 추가
                </button>
              )}
            </div>
            {currentTeamPlayers.length === 0 && (
              <div className="text-center py-8 text-slate-500 border border-slate-800 rounded-2xl text-sm">등록된 선수가 없습니다.</div>
            )}
            <div className="space-y-2">
              {currentTeamPlayers.map(p => (
                <div key={p.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center group shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-600 flex items-center justify-center font-black text-slate-400">{p.birthYear}</div>
                    <div>
                      <div className="font-bold text-white text-lg">{p.name}</div>
                      <div className="text-xs text-slate-400 font-medium">참석: <span className="text-blue-400 font-bold">{p.caps}</span>회</div>
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

      <nav className="fixed bottom-0 w-full max-w-md bg-slate-900 border-t border-slate-800 flex justify-around p-2 pb-6 z-40">
        <button onClick={() => setActiveTab('matches')} className={`flex flex-col items-center p-2 flex-1 ${activeTab === 'matches' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
          <List size={20} className="mb-1" />
          <span className="text-[10px] font-bold">경기</span>
        </button>
        <button onClick={() => setActiveTab('schedule')} className={`flex flex-col items-center p-2 flex-1 ${activeTab === 'schedule' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
          <Calendar size={20} className="mb-1" />
          <span className="text-[10px] font-bold">스케쥴</span>
        </button>
        <button onClick={() => setActiveTab('roster')} className={`flex flex-col items-center p-2 flex-1 ${activeTab === 'roster' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
          <Users size={20} className="mb-1" />
          <span className="text-[10px] font-bold">명단</span>
        </button>
      </nav>

      {/* ============================================================================ */}
      {/* MODALS */}
      {/* ============================================================================ */}
      
      {/* Match Details Modal */}
      {detailModal.isOpen && detailModal.match && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-800 rounded-3xl w-full max-w-md border border-slate-700 max-h-[85vh] flex flex-col shadow-xl overflow-hidden">
            <div className="p-6 border-b border-slate-700 bg-slate-900 shrink-0">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${detailModal.match.matchType === 'external' ? 'bg-purple-500/20 text-purple-400' : 'bg-green-500/20 text-green-400'}`}>
                      {detailModal.match.matchType === 'external' ? '교류전' : '자체전'}
                    </span>
                    <h2 className="text-lg font-black text-white">{detailModal.match.date} 결과</h2>
                  </div>
                  <p className="text-sm text-slate-400"><MapPin size={12} className="inline mr-1"/>{detailModal.match.location}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => triggerShare(detailModal.match)} className="text-yellow-500 bg-slate-800 p-2 rounded-full hover:bg-slate-700 transition"><Share2 size={20}/></button>
                  <button onClick={() => setDetailModal({isOpen: false, match: null})} className="text-slate-400 bg-slate-800 p-2 rounded-full hover:text-white transition"><X size={20}/></button>
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">
              <div className="bg-slate-900 rounded-2xl p-4 border border-slate-700">
                <div className="text-xs text-slate-400 mb-3 font-bold border-b border-slate-800 pb-2">순위표</div>
                <table className="w-full text-xs text-center">
                  <thead>
                    <tr className="text-slate-500 font-bold">
                      <th className="pb-2">순위</th><th className="pb-2 text-left">팀</th><th className="pb-2 text-blue-400">승점</th><th className="pb-2">승</th><th className="pb-2">무</th><th className="pb-2">패</th><th className="pb-2">득</th><th className="pb-2">실</th><th className="pb-2">득실</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculateStandings(detailModal.match).map((st, index) => (
                      <tr key={st.team} className="border-t border-slate-800">
                        <td className={`py-2 font-black ${index === 0 ? 'text-yellow-400' : 'text-slate-400'}`}>{index + 1}</td>
                        <td className={`py-2 text-left font-bold ${TEAM_TEXT_COLORS[st.team]}`}>{getTeamDisplayName(detailModal.match, st.team)}</td>
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

              {detailModal.match.quarterScores.map(qs => (
                <div key={qs.quarter} className="bg-slate-900 rounded-2xl p-4 border border-slate-700">
                   <div className="relative flex justify-center items-center border-b border-slate-800 pb-3 mb-3">
                     <span className="absolute left-0 font-black text-blue-400">{qs.quarter}Q</span>
                     <span className="font-bold text-white text-lg text-center">
                       <span className={TEAM_TEXT_COLORS[qs.team1]}>{getTeamDisplayName(detailModal.match, qs.team1)}</span> 
                       <span className="text-slate-500 mx-3">{qs.score1} : {qs.score2}</span> 
                       <span className={TEAM_TEXT_COLORS[qs.team2]}>{getTeamDisplayName(detailModal.match, qs.team2)}</span>
                     </span>
                   </div>
                   <div className="space-y-3">
                     {detailModal.match.logs.filter(l => l.quarter === qs.quarter).map(l => {
                       const isLeft = l.teamLetter === qs.team1;
                       return (
                         <div 
                           key={l.id} 
                           onClick={() => isAdmin && openLogEditModal(l, detailModal.match)}
                           className={`flex items-start gap-2 w-full ${isLeft ? 'flex-row' : 'flex-row-reverse'} ${isAdmin ? 'cursor-pointer hover:bg-slate-800 p-1 rounded-lg transition -mx-1 px-1' : ''}`}
                         >
                           <span className="text-slate-600 text-[10px] w-8 shrink-0 text-center">{l.time}</span>
                           <div className={`flex flex-col ${isLeft ? 'items-start' : 'items-end'}`}>
                             <div className="text-white font-bold text-sm flex items-center gap-1">
                               <span className={TEAM_TEXT_COLORS[l.teamLetter]}>⚽</span> {l.scorerName}
                               {l.isPK && <span className="text-[9px] bg-red-500/20 text-red-400 px-1 py-0.5 rounded ml-1 border border-red-500/30">PK</span>}
                             </div>
                             {l.assistName && (
                               <div className="text-slate-400 mt-0.5 flex items-center gap-1">
                                 <Footprints size={12} className="text-slate-500"/> <span className="text-xs">{l.assistName}</span>
                               </div>
                             )}
                             {l.remark && (
                               <div className={`text-slate-400 mt-1 text-[10px] bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700 ${isLeft ? 'text-left' : 'text-right'}`}>
                                 {l.remark}
                               </div>
                             )}
                           </div>
                         </div>
                       )
                     })}
                     {detailModal.match.logs.filter(l => l.quarter === qs.quarter).length === 0 && <div className="text-sm text-slate-500 italic text-center py-2">득점 기록이 없습니다.</div>}
                     
                     {isAdmin && (
                        <button 
                           onClick={() => { setManualGoalTeam(qs.team1); setManualGoalModal({ isOpen: true, match: detailModal.match, quarterQs: qs }); }} 
                           className="w-full mt-3 py-2 border border-slate-700 border-dashed rounded-lg text-xs font-bold text-slate-500 hover:text-white hover:border-slate-500 transition flex items-center justify-center gap-1"
                        >
                           <Plus size={14}/> 누락된 득점 추가
                        </button>
                     )}
                   </div>
                </div>
              ))}

              <div className="bg-slate-900 rounded-2xl p-4 border border-slate-700">
                <div className="text-xs text-slate-400 mb-4 font-bold border-b border-slate-800 pb-2 flex justify-between items-end">
                    <span>참석자 편성 명단</span>
                    <span className="text-[9px] font-normal text-slate-500">* ( )는 팀 이동 내역</span>
                </div>
                <div className="space-y-4">
                  {TEAM_LETTERS.slice(0, detailModal.match.teamCount).map(teamLetter => {
                    const teamPlayers = players.filter(p => 
                      detailModal.match.attendees.includes(p.id) && 
                      (detailModal.match.teamAssignments[p.id] || 'A') === teamLetter
                    );
                    
                    if(teamPlayers.length === 0) return null;

                    return (
                      <div key={teamLetter}>
                        <div className={`text-[11px] font-black mb-2 ${TEAM_TEXT_COLORS[teamLetter]}`}>
                          {getTeamDisplayName(detailModal.match, teamLetter)}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {teamPlayers.map(p => {
                            const history = detailModal.match.teamHistory?.[p.id];
                            let historyStr = "";
                            if (history && history.length > 1) {
                                historyStr = ` (${history.join('➔')})`;
                            }
                            return (
                              <div key={p.id} className="bg-slate-800 px-2 py-1.5 rounded border border-slate-700 text-[10px] text-slate-300 flex items-center">
                                <span className="font-bold text-white">{p.name}</span>
                                {historyStr && <span className="text-slate-500 ml-1 tracking-tighter font-medium">{historyStr}</span>}
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
        </div>
      )}

      {/* Match Form Modal */}
      {matchModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-end justify-center z-50">
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

            <form id="matchForm" onSubmit={saveMatch} className="space-y-4 overflow-y-auto custom-scrollbar flex-1 pb-4 pr-2">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-400 mb-1">날짜</label>
                  <input type="date" name="date" required defaultValue={matchModal.match?.date || "2026-07-02"} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-400 mb-1">시간</label>
                  <input type="time" name="time" required defaultValue={matchModal.match?.time || "19:00"} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" />
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
                      <input type="checkbox" name={`attendee_${p.id}`} defaultChecked={matchModal.match ? matchModal.match.attendees?.includes(p.id) : true} className="accent-blue-500 w-4 h-4 rounded" />
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
      )}

      {/* Assignment Modal (Main View) */}
      {assignmentModal.isOpen && assignmentModal.match && assignmentModal.match.matchType !== 'external' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-md border border-slate-700 max-h-[80vh] flex flex-col shadow-xl">
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-700">
              <div><h2 className="text-lg font-bold text-white">참석자 팀 편성</h2></div>
              <button onClick={() => setAssignmentModal({isOpen: false, match: null})} className="text-white bg-blue-500 px-4 py-2 rounded-xl font-bold">완료</button>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
              {currentTeamPlayers.filter(p => assignmentModal.match.attendees.includes(p.id)).map(p => {
                const currentTeam = assignmentModal.match.teamAssignments[p.id] || 'A';
                return (
                  <div key={p.id} className="bg-slate-900 p-3 rounded-xl flex justify-between items-center border border-slate-700">
                    <div className="font-bold text-white">{p.name} <span className="text-xs text-slate-500 ml-1">{p.birthYear}</span></div>
                    <div className="flex bg-slate-800 rounded-lg p-1">
                      {TEAM_LETTERS.slice(0, assignmentModal.match.teamCount).map(t => (
                        <button 
                          key={t} onClick={() => assignTeam(p.id, t)}
                          className={`w-8 h-8 flex items-center justify-center text-xs font-black rounded-md transition ${currentTeam === t ? TEAM_COLORS[t] + ' shadow' : 'text-slate-500 hover:text-white'}`}
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
      )}

      {/* Roster Form Modal */}
      {rosterModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
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
      )}

      {/* Admin Mode Auth Modal */}
      {authModal.isOpen && authModal.type === 'adminMode' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Shield size={20} className="text-blue-500"/> 
              팀 관리자 전환
            </h2>
            <p className="text-xs text-slate-400 mb-4">현재 팀의 일정 관리 권한을 위해<br/>팀 관리자 비밀번호를 입력하세요.</p>
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

      {/* Team & System Settings Modal */}
      {teamSettingsModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
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
      )}

      {/* 숨겨진 화면 캡처 전용 컴포넌트 */}
      {renderHiddenCaptureArea()}

      {renderLogEditModal()}
      {renderSystemModals()}
      {renderShareModal()}
    </div>
  );
}