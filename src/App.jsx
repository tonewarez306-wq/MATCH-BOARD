import React, { useState, useMemo, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, where } from 'firebase/firestore';
import { 
  Calendar, Users, BarChart2, Plus, 
  MapPin, Trophy, Shield, 
  ChevronRight, ChevronLeft, X, Play, Edit, Trash2, CheckCircle, Activity, List, LogOut, Share2, MessageCircle, Footprints, Settings, Target, Undo, Redo,
  MousePointer, ArrowUpRight, TrendingUp, Square, XCircle, Video, PlayCircle, RotateCcw
} from 'lucide-react';

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

const TEAM_LETTERS = ['A', 'B', 'C', 'D'];
const TEAM_COLORS = {
  'A': 'text-red-400 bg-red-500/10 border-red-500/30',
  'B': 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  'C': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  'D': 'text-green-400 bg-green-500/10 border-green-500/30'
};
const TEAM_TEXT_COLORS = { 'A': 'text-red-400', 'B': 'text-blue-400', 'C': 'text-yellow-400', 'D': 'text-green-400' };

const getMatchTeamCount = (match) => {
  if (!match) return 2;
  if (match.matchType === 'external') return 2;
  
  let maxIdx = 1; 
  const checkTeam = (t) => {
    const idx = TEAM_LETTERS.indexOf(t);
    if (idx > maxIdx) maxIdx = idx;
  };

  if (match.teamAssignments) Object.values(match.teamAssignments).forEach(checkTeam);
  if (match.logs) match.logs.forEach(l => checkTeam(l.teamLetter));
  if (match.quarterScores) match.quarterScores.forEach(qs => { checkTeam(qs.team1); checkTeam(qs.team2); });
  
  let savedCount = parseInt(match.teamCount, 10);
  if (!isNaN(savedCount) && savedCount > maxIdx + 1) {
    return savedCount;
  }
  
  return maxIdx + 1; 
};

const getTournamentQuarterInfo = (quarter) => {
  const setNum = Math.ceil(quarter / 4);
  const matchInSet = (quarter - 1) % 4 + 1;
  const labels = ['1경기', '2경기', '패자전', '승자전'];
  return { setNum, matchInSet, title: `${setNum}세트 ${labels[matchInSet - 1]}` };
};

const getTournamentMatchup = (quarter, match, stats = null) => {
  if (!match || !match.isTournament) return ['A', 'B'];
  const { setNum, matchInSet } = getTournamentQuarterInfo(quarter);
  
  if (matchInSet === 1) {
    if (setNum === 1) return ['A', 'B'];
    if (setNum === 2) return ['A', 'C'];
    if (setNum === 3) return ['A', 'D'];
  }
  if (matchInSet === 2) {
    if (setNum === 1) return ['C', 'D'];
    if (setNum === 2) return ['B', 'D'];
    if (setNum === 3) return ['B', 'C'];
  }
  
  const q1 = (setNum - 1) * 4 + 1;
  const q2 = (setNum - 1) * 4 + 2;
  const qs1 = (match.quarterScores || []).find(q => q.quarter === q1);
  const qs2 = (match.quarterScores || []).find(q => q.quarter === q2);
  
  if (!qs1 || !qs2) return ['A', 'B']; 
  
  const resolveWinner = (qs) => {
      if (qs.score1 > qs.score2) return { w: qs.team1, l: qs.team2 };
      if (qs.score1 < qs.score2) return { w: qs.team2, l: qs.team1 };
      if (stats && stats[qs.team1] && stats[qs.team2]) {
          if (stats[qs.team1].gd > stats[qs.team2].gd) return { w: qs.team1, l: qs.team2 };
          if (stats[qs.team1].gd < stats[qs.team2].gd) return { w: qs.team2, l: qs.team1 };
          if (stats[qs.team1].gf > stats[qs.team2].gf) return { w: qs.team1, l: qs.team2 };
          if (stats[qs.team1].gf < stats[qs.team2].gf) return { w: qs.team2, l: qs.team1 };
      }
      // 홈팀 우선 (동률 시)
      return { w: qs.team1, l: qs.team2 };
  };

  const res1 = resolveWinner(qs1);
  const res2 = resolveWinner(qs2);
  
  if (matchInSet === 3) return [res1.l, res2.l]; 
  if (matchInSet === 4) return [res1.w, res2.w]; 
  return ['A', 'B'];
};

const calculateTournamentStandings = (match) => {
  const stats = {};
  TEAM_LETTERS.forEach(t => {
    stats[t] = { team: t, matches: 0, setPts: 0, s1: 0, s2: 0, s3: 0, gd: 0, gf: 0, ga: 0, w: 0, d: 0, l: 0 };
  });

  (match.quarterScores || []).forEach(qs => {
    const { team1, team2, score1, score2 } = qs;
    if (!stats[team1] || !stats[team2]) return;
    stats[team1].matches++; stats[team2].matches++;
    stats[team1].gf += score1; stats[team1].ga += score2;
    stats[team2].gf += score2; stats[team2].ga += score1;
    stats[team1].gd += (score1 - score2); stats[team2].gd += (score2 - score1);
    if (score1 > score2) { stats[team1].w++; stats[team2].l++; }
    else if (score1 < score2) { stats[team1].l++; stats[team2].w++; }
    else { stats[team1].d++; stats[team2].d++; }
  });

  for (let setNum = 1; setNum <= 3; setNum++) {
    const setQuarters = [1,2,3,4].map(i => (setNum - 1) * 4 + i);
    const playedInSet = (match.quarterScores || []).filter(qs => setQuarters.includes(qs.quarter));
    
    const qs3 = playedInSet.find(q => q.quarter === setQuarters[2]);
    const qs4 = playedInSet.find(q => q.quarter === setQuarters[3]);

    let setStats = {};
    TEAM_LETTERS.forEach(t => setStats[t] = { gd: 0, gf: 0 });
    playedInSet.slice(0, 2).forEach(qs => {
        if(setStats[qs.team1]) { setStats[qs.team1].gd += (qs.score1 - qs.score2); setStats[qs.team1].gf += qs.score1; }
        if(setStats[qs.team2]) { setStats[qs.team2].gd += (qs.score2 - qs.score1); setStats[qs.team2].gf += qs.score2; }
    });

    let ranks = []; 
    if (qs4) {
      let w = qs4.team1, l = qs4.team2;
      if (qs4.score1 > qs4.score2) { w = qs4.team1; l = qs4.team2; }
      else if (qs4.score1 < qs4.score2) { w = qs4.team2; l = qs4.team1; }
      else {
        if (setStats[qs4.team1].gd > setStats[qs4.team2].gd) { w = qs4.team1; l = qs4.team2; }
        else if (setStats[qs4.team1].gd < setStats[qs4.team2].gd) { w = qs4.team2; l = qs4.team1; }
        else if (setStats[qs4.team1].gf > setStats[qs4.team2].gf) { w = qs4.team1; l = qs4.team2; }
        else if (setStats[qs4.team1].gf < setStats[qs4.team2].gf) { w = qs4.team2; l = qs4.team1; }
        else { w = qs4.team1; l = qs4.team2; } 
      }
      ranks[0] = w; ranks[1] = l;
    }
    if (qs3) {
      let w = qs3.team1, l = qs3.team2;
      if (qs3.score1 > qs3.score2) { w = qs3.team1; l = qs3.team2; }
      else if (qs3.score1 < qs3.score2) { w = qs3.team2; l = qs3.team1; }
      else {
        if (setStats[qs3.team1].gd > setStats[qs3.team2].gd) { w = qs3.team1; l = qs3.team2; }
        else if (setStats[qs3.team1].gd < setStats[qs3.team2].gd) { w = qs3.team2; l = qs3.team1; }
        else if (setStats[qs3.team1].gf > setStats[qs3.team2].gf) { w = qs3.team1; l = qs3.team2; }
        else if (setStats[qs3.team1].gf < setStats[qs3.team2].gf) { w = qs3.team2; l = qs3.team1; }
        else { w = qs3.team1; l = qs3.team2; } 
      }
      ranks[2] = w; ranks[3] = l;
    }

    if (ranks[0]) { stats[ranks[0]].setPts += 4; stats[ranks[0]][`s${setNum}`] = 4; }
    if (ranks[1]) { stats[ranks[1]].setPts += 3; stats[ranks[1]][`s${setNum}`] = 3; }
    if (ranks[2]) { stats[ranks[2]].setPts += 2; stats[ranks[2]][`s${setNum}`] = 2; }
    if (ranks[3]) { stats[ranks[3]].setPts += 1; stats[ranks[3]][`s${setNum}`] = 1; }
  }

  return Object.values(stats).sort((a, b) => {
    if (b.setPts !== a.setPts) return b.setPts - a.setPts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    return b.gf - a.gf;
  });
};

const calculateStandings = (match) => {
  if (match.isTournament) return calculateTournamentStandings(match);
  
  const stats = {};
  const actualTeamCount = getMatchTeamCount(match); 
  
  TEAM_LETTERS.slice(0, actualTeamCount).forEach(t => {
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

const resizeImage = (file, maxWidth = 1200, maxHeight = 1200) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width; let height = img.height;
        if (width > height) { if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; } } 
        else { if (height > maxHeight) { width = Math.round((width * maxHeight) / height); height = maxHeight; } }
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

export default function App() {
  const [user, setUser] = useState(null);
  const [appState, setAppState] = useState('login'); 
  const [activeTab, setActiveTab] = useState('matches'); 
  
  const [statsPeriod, setStatsPeriod] = useState('month'); 
  const [statsType, setStatsType] = useState('total'); 
  
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
  const [quarterEditModal, setQuarterEditModal] = useState({ isOpen: false, match: null, quarterScore: null });
  
  const [detailModal, setDetailModal] = useState({ isOpen: false, match: null }); 
  const [detailModalMatchId, setDetailModalMatchId] = useState(null); 
  
  const [rosterModal, setRosterModal] = useState({ isOpen: false, player: null });
  const [shareModal, setShareModal] = useState({ isOpen: false, step: 1, data: null, file: null, imgUrl: null, isVideo: false });
  const [galleryModal, setGalleryModal] = useState({ isOpen: false, photos: [], currentIndex: 0, matchId: null });

  const [liveMatchId, setLiveMatchId] = useState(null);
  const [liveState, setLiveState] = useState({ currentQuarter: 1, playingTeams: ['A', 'B'], isQuarterActive: false });
  
  const [goalFlow, setGoalFlow] = useState({ isOpen: false, step: 1, matchId: null, quarter: null, teamLetter: null, availableTeams: [], scorer: null, isPK: false, remark: '', isMissingAdd: false });
  const [logEditModal, setLogEditModal] = useState({ isOpen: false, match: null, log: null });
  const [showOtherTeams, setShowOtherTeams] = useState(false);

  const [pitchType, setPitchType] = useState('full'); 
  const [currentTool, setCurrentTool] = useState('move'); 
  const [tacticTokens, setTacticTokens] = useState(getInitialTacticsTokens('full'));
  const [drawings, setDrawings] = useState([]);
  const [pastState, setPastState] = useState([]);
  const [futureState, setFutureState] = useState([]);
  const [draggingToken, setDraggingToken] = useState(null);
  const [tokenEditModal, setTokenEditModal] = useState({ isOpen: false, token: null });
  
  const [animationFrames, setAnimationFrames] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAutoRecording, setIsAutoRecording] = useState(false); 
  
  const playbackRef = useRef(null);
  const boardRef = useRef(null);
  const pointerDownInfo = useRef({ x: 0, y: 0, time: 0 });
  const dragStartTokensRef = useRef(null);
  const activeDrawingData = useRef(null);
  const svgArrowRef = useRef(null);
  const svgPassRef = useRef(null);
  const svgZoneRef = useRef(null);

  const activeTeam = useMemo(() => teams.find(t => t.id === activeTeamId), [teams, activeTeamId]);
  const currentTeamPlayers = useMemo(() => players.filter(p => p.teamId === activeTeamId), [players, activeTeamId]);
  const currentTeamMatches = useMemo(() => matches.filter(m => m.teamId === activeTeamId), [matches, activeTeamId]);
  const liveMatch = useMemo(() => matches.find(m => m.id === liveMatchId), [matches, liveMatchId]);
  const detailMatch = useMemo(() => matches.find(m => m.id === detailModalMatchId), [matches, detailModalMatchId]);

  const checkCanEdit = (match) => {
    if (isAdmin) return true;
    if (!match) return false;
    if (match.status === 'completed') return false; 
    const safeDate = match.date.replace(/-/g, '/');
    const matchDateTime = new Date(`${safeDate} ${match.time}`);
    return new Date() >= matchDateTime;
  };

  const getTeamDisplayName = (match, letter) => {
    if (!match) return `${letter}팀`;
    if (match.matchType === 'external') {
      if (letter === 'A') return activeTeam?.name || '우리 팀';
      if (letter === 'B') return match.opponentName || '상대 팀';
    }
    return `${letter}팀`;
  };

  const viewYearMonth = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;
  const viewYear = `${viewDate.getFullYear()}`;
  
  const monthlyMatches = useMemo(() => currentTeamMatches.filter(m => m.date.startsWith(viewYearMonth)), [currentTeamMatches, viewYearMonth]);
  const yearlyMatches = useMemo(() => currentTeamMatches.filter(m => m.date.startsWith(viewYear)), [currentTeamMatches, viewYear]);
  
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
    const completedMatches = currentTeamMatches.filter(m => m.status === 'completed' && m.matchType !== 'futsal');
    completedMatches.forEach(m => {
      (m.attendees || []).forEach(pid => { if (stats[pid]) stats[pid].trueCaps += 1; });
      (m.logs || []).forEach(log => {
        if (log.scorerId && stats[log.scorerId]) stats[log.scorerId].trueGoals += 1;
        if (log.assistId && stats[log.assistId]) stats[log.assistId].trueAssists += 1;
      });
    });
    return Object.values(stats).sort((a,b) => b.trueCaps !== a.trueCaps ? b.trueCaps - a.trueCaps : b.trueGoals - a.trueGoals);
  }, [currentTeamPlayers, currentTeamMatches]);

  const filteredStats = useMemo(() => {
    const statsMap = {}; 
    currentTeamPlayers.forEach(p => { statsMap[p.id] = { id: p.id, name: p.name, caps: 0, goals: 0, assists: 0 }; });
    
    let targetMatches = currentTeamMatches.filter(m => m.status === 'completed');
    if (statsPeriod === 'month') targetMatches = targetMatches.filter(m => m.date.startsWith(viewYearMonth));
    else if (statsPeriod === 'year') targetMatches = targetMatches.filter(m => m.date.startsWith(viewYear));
    
    if (statsType === 'total') targetMatches = targetMatches.filter(m => m.matchType === 'internal' || m.matchType === 'external');
    else targetMatches = targetMatches.filter(m => m.matchType === statsType);

    targetMatches.forEach(m => {
      (m.attendees || []).forEach(pId => { if(statsMap[pId]) statsMap[pId].caps += 1; });
      (m.logs || []).forEach(log => {
        if (log.scorerId && statsMap[log.scorerId]) statsMap[log.scorerId].goals += 1;
        if (log.assistId && statsMap[log.assistId]) statsMap[log.assistId].assists += 1;
      });
    });
    return Object.values(statsMap).sort((a, b) => b.goals !== a.goals ? b.goals - a.goals : (b.assists !== a.assists ? b.assists - a.assists : b.caps - a.caps));
  }, [currentTeamMatches, currentTeamPlayers, statsPeriod, viewYearMonth, viewYear, statsType]);

  const titlePrefix = statsPeriod === 'month' ? '이달의' : '올해의';
  const maxGoals = filteredStats.length > 0 ? Math.max(...filteredStats.map(s => s.goals)) : 0;
  const topScorers = filteredStats.filter(s => s.goals === maxGoals && maxGoals > 0);
  const maxAssists = filteredStats.length > 0 ? Math.max(...filteredStats.map(s => s.assists)) : 0;
  const topAssists = filteredStats.filter(s => s.assists === maxAssists && maxAssists > 0);
  const maxCaps = filteredStats.length > 0 ? Math.max(...filteredStats.map(s => s.caps)) : 0;
  const topCaps = filteredStats.filter(s => s.caps === maxCaps && maxCaps > 0);

  const globalStyles = (
    <style>{`
      body { overscroll-behavior-y: none; }
      *::-webkit-scrollbar { display: none !important; width: 0 !important; }
      * { -ms-overflow-style: none !important; scrollbar-width: none !important; }
      .tactic-board { touch-action: none; }
      input[type="number"]::-webkit-outer-spin-button, input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      input[type="number"] { -moz-appearance: textfield; }
      .will-change-transform { will-change: transform, left, top; }
      input, select, textarea { font-size: 16px !important; }
    `}</style>
  );

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) setUser(currentUser);
      else signInAnonymously(auth).catch(console.error);
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
    return () => { if (playbackRef.current) cancelAnimationFrame(playbackRef.current); };
  }, []);

  const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  const prevYear = () => setViewDate(new Date(viewDate.getFullYear() - 1, viewDate.getMonth(), 1));
  const nextYear = () => setViewDate(new Date(viewDate.getFullYear() + 1, viewDate.getMonth(), 1));

  const openMatchModal = (match) => { setMatchTypeForm(match?.matchType || 'internal'); setMatchModal({ isOpen: true, match }); };

  const handleActionClick = (action, match) => {
    if (!checkCanEdit(match)) { setSystemAlert({ isOpen: true, message: `경기 시간 이후에만 기록이 가능합니다.\n(관리자는 언제든 가능)` }); return; }
    if (action === 'assign') setAssignmentModal({ isOpen: true, match });
    if (action === 'start') {
      const qScores = match.quarterScores || [];
      const mLogs = match.logs || [];
      const currentQ = qScores.length + 1;
      const currentLogs = mLogs.filter(l => l.quarter === currentQ);
      
      const stats = match.isTournament ? calculateTournamentStandings(match) : null;
      let playingTeams = match.isTournament ? getTournamentMatchup(currentQ, match, stats) : ['A', 'B'];
      let isQuarterActive = false;
      
      if (match.matchType === 'external') { if (currentLogs.length > 0) isQuarterActive = true; } 
      else {
         if (currentLogs.length > 0) {
            const teamsInLogs = [...new Set(currentLogs.map(l => l.teamLetter))];
            if (teamsInLogs.length === 2) playingTeams = teamsInLogs; else if (teamsInLogs.length === 1) playingTeams = [teamsInLogs[0], TEAM_LETTERS.find(t => t !== teamsInLogs[0])];
            isQuarterActive = true;
         }
      }
      setLiveMatchId(match.id); setLiveState({ currentQuarter: currentQ, playingTeams: playingTeams, isQuarterActive: isQuarterActive }); setAppState('liveMatch');
    }
  };

  const handleAuthSubmit = (e) => {
    e.preventDefault(); const pwd = e.target.password.value;
    if (authModal.type === 'loginAdminAuth') {
      if (pwd === adminPassword) { setIsLoginAdminMode(true); setAuthModal({ isOpen: false }); } else setSystemAlert({ isOpen: true, message: '시스템 관리자 비밀번호가 틀렸습니다.' });
    } else if (authModal.type === 'adminCreate') {
      if (pwd === adminPassword) { setAuthModal({ isOpen: false }); setIsCreateTeamOpen(true); } else setSystemAlert({ isOpen: true, message: '시스템 관리자 비밀번호가 틀렸습니다.' });
    } else if (authModal.type === 'adminMode') {
      if (pwd === (activeTeam?.adminPassword || 'admin')) { setIsAdmin(true); setAuthModal({ isOpen: false }); } else setSystemAlert({ isOpen: true, message: '팀 관리자 비밀번호가 틀렸습니다.' });
    } else if (authModal.type === 'teamLogin') {
      if (pwd === authModal.targetTeam.password) { setActiveTeamId(authModal.targetTeam.id); setIsAdmin(false); setAppState('main'); setAuthModal({ isOpen: false }); } else setSystemAlert({ isOpen: true, message: '팀 비밀번호가 틀렸습니다.' });
    }
  };

  const logout = () => { setActiveTeamId(null); setIsAdmin(false); setAppState('login'); setAuthModal({ isOpen: false, type: '', targetTeam: null }); };

  const saveMatch = async (e) => {
    e.preventDefault(); if(isProcessing) return; setIsProcessing(true);
    try {
      const fd = new FormData(e.target);
      const attendees = currentTeamPlayers.filter(p => fd.get(`attendee_${p.id}`)).map(p => p.id);
      const matchType = matchTypeForm;
      const isTournament = fd.get('isTournament') === 'true';
      const opponentName = matchType === 'external' ? fd.get('opponentName') : '';
      const teamCount = isTournament ? 4 : (matchType === 'external' ? 2 : parseInt(fd.get('teamCount')));
      const totalQuarters = isTournament ? 12 : parseInt(fd.get('totalQuarters'));
      
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

      const newMatch = { ...matchModal.match, id: matchId, teamId: activeTeamId, date: fd.get('date'), time: fd.get('time'), location: fd.get('location'), matchType, opponentName, teamCount, isTournament, totalQuarters, attendees, teamAssignments: newAssignments, scores: matchModal.match?.scores || { A: 0, B: 0, C: 0, D: 0 }, quarterScores: matchModal.match?.quarterScores || [], logs: matchModal.match?.logs || [], status: matchModal.match?.status || 'scheduled' };
      await setDoc(doc(db, 'matches', matchId), newMatch);
      setMatchModal({ isOpen: false, match: null });
    } finally { setIsProcessing(false); }
  };

  const requestDeleteMatch = (id) => { setSystemConfirm({ isOpen: true, message: '정말 삭제하시겠습니까?', onConfirm: async () => { if(isProcessing) return; setIsProcessing(true); await deleteDoc(doc(db, 'matches', id)); setMatchModal({ isOpen: false, match: null }); setDetailModal({isOpen: false, match: null}); setIsProcessing(false); } }); };

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

  const assignTeam = (playerId, teamLetter) => {
    const m = assignmentModal.match;
    if(m) {
      const currentTeam = m.teamAssignments?.[playerId] || null;
      if (currentTeam === teamLetter) return;
      const updatedMatch = { ...m, teamAssignments: { ...m.teamAssignments, [playerId]: teamLetter } };
      setAssignmentModal(prev => ({ ...prev, match: updatedMatch }));
      setDoc(doc(db, 'matches', m.id), updatedMatch).catch(console.error);
    }
  };

  const handleUploadPhotos = async (e, matchId) => {
    const files = e.target.files; if (!files || files.length === 0) return;
    setIsProcessing(true);
    try {
      const match = matches.find(m => m.id === matchId);
      let newPhotos = [...(match.photos || [])];
      for (let i = 0; i < files.length; i++) {
        const resized = await resizeImage(files[i], 1200, 1200);
        newPhotos.push({ id: Date.now() + i, url: resized });
      }
      await setDoc(doc(db, 'matches', matchId), { ...match, photos: newPhotos });
    } catch(err) { setSystemAlert({ isOpen: true, message: '사진 업로드 중 오류가 발생했습니다.' }); } finally { setIsProcessing(false); }
  };

  const requestDeletePhoto = (photoId) => {
    setSystemConfirm({ isOpen: true, message: '이 사진을 삭제하시겠습니까?', onConfirm: async () => {
      setIsProcessing(true);
      try {
        const match = matches.find(m => m.id === galleryModal.matchId);
        const newPhotos = (match.photos || []).filter(p => p.id !== photoId);
        await setDoc(doc(db, 'matches', match.id), { ...match, photos: newPhotos });
        if (newPhotos.length === 0) setGalleryModal({ isOpen: false, photos: [], currentIndex: 0, matchId: null });
        else setGalleryModal(prev => ({ ...prev, photos: newPhotos, currentIndex: Math.max(0, prev.currentIndex - 1) }));
      } finally { setIsProcessing(false); }
    }});
  };
  
  let touchStartX = 0;
  const handleTouchStart = (e) => { touchStartX = e.changedTouches[0].screenX; };
  const handleTouchEnd = (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    if (touchEndX < touchStartX - 50 && galleryModal.currentIndex < galleryModal.photos.length - 1) setGalleryModal(p => ({ ...p, currentIndex: p.currentIndex + 1 }));
    if (touchEndX > touchStartX + 50 && galleryModal.currentIndex > 0) setGalleryModal(p => ({ ...p, currentIndex: p.currentIndex - 1 }));
  };

  const handleGoalSubmit = async (selectedId, teamLetter) => {
    if (goalFlow.step === 1) { 
      setGoalFlow({ ...goalFlow, step: 2, teamLetter, scorer: selectedId }); 
      setShowOtherTeams(false);
    } else {
      if(isProcessing) return; setIsProcessing(true);
      const { matchId: gfMatchId, quarter: gfQuarter, teamLetter: gfTeamLetter, scorer: gfScorer, isPK: gfIsPK, remark: gfRemark, isMissingAdd: gfIsMissingAdd } = goalFlow;
      setGoalFlow({ isOpen: false, step: 1, matchId: null, quarter: null, teamLetter: null, scorer: null, isPK: false, remark: '', isMissingAdd: false });
      setShowOtherTeams(false);
      try {
        const targetMatchId = gfMatchId || liveMatchId; const targetMatch = matches.find(m => m.id === targetMatchId); const quarter = gfQuarter || liveState.currentQuarter;
        const assistId = selectedId;
        
        let finalScorerId = gfScorer === 'mercenary' ? null : gfScorer;
        let finalAssistId = assistId === 'mercenary' ? null : assistId;

        const scorer = players.find(p => p.id === finalScorerId);
        let finalScorerName = scorer?.name || null;
        if (scorer && targetMatch.teamAssignments && targetMatch.teamAssignments[scorer.id] && targetMatch.teamAssignments[scorer.id] !== gfTeamLetter) {
           finalScorerName = `(${targetMatch.teamAssignments[scorer.id]}팀) ${scorer.name}`;
        }
        if (gfScorer === 'mercenary') finalScorerName = '용병';
        if (!gfScorer) finalScorerName = '상대팀'; 

        const assist = players.find(p => p.id === finalAssistId);
        let finalAssistName = assist?.name || null;
        if (assist && targetMatch.teamAssignments && targetMatch.teamAssignments[assist.id] && targetMatch.teamAssignments[assist.id] !== gfTeamLetter) {
           finalAssistName = `(${targetMatch.teamAssignments[assist.id]}팀) ${assist.name}`;
        }
        if (assistId === 'mercenary') finalAssistName = '용병';

        const newLog = { id: Date.now(), quarter, teamLetter: gfTeamLetter, scorerId: finalScorerId, scorerName: finalScorerName, assistId: finalAssistId, assistName: finalAssistName, time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute:'2-digit' }), isPK: gfIsPK, remark: gfRemark };
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
        if (finalScorerId) { if (scorer) updatePromises.push(setDoc(doc(db, 'players', scorer.id), { ...scorer, goals: (scorer.goals || 0) + 1 })); }
        if (finalAssistId) { if (assist) updatePromises.push(setDoc(doc(db, 'players', assist.id), { ...assist, assists: (assist.assists || 0) + 1 })); }
        await Promise.all(updatePromises);
      } finally { setIsProcessing(false); }
    }
  };

  const handleLogEditSave = async (e) => {
    e.preventDefault(); if(isProcessing) return; setIsProcessing(true);
    try {
      const fd = new FormData(e.target); const newScorerId = fd.get('scorerId') === 'none' ? null : fd.get('scorerId'); const newAssistId = fd.get('assistId') === 'none' ? null : fd.get('assistId');
      const newIsPK = fd.get('isPK') === 'true'; const newRemark = fd.get('remark') || '';
      const m = matches.find(match => match.id === logEditModal.match.id); const l = logEditModal.log;
      const oldScorerId = l.scorerId; const oldAssistId = l.assistId; const updatePromises = [];

      if (oldScorerId !== newScorerId) {
          if (oldScorerId && oldScorerId !== 'mercenary') { const p = players.find(p => p.id === oldScorerId); if (p) updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, goals: Math.max(0, (p.goals || 0) - 1) })); }
          if (newScorerId && newScorerId !== 'mercenary') { const p = players.find(p => p.id === newScorerId); if (p) updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, goals: (p.goals || 0) + 1 })); }
      }
      if (oldAssistId !== newAssistId) {
          if (oldAssistId && oldAssistId !== 'mercenary') { const p = players.find(p => p.id === oldAssistId); if (p) updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, assists: Math.max(0, (p.assists || 0) - 1) })); }
          if (newAssistId && newAssistId !== 'mercenary') { const p = players.find(p => p.id === newAssistId); if (p) updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, assists: (p.assists || 0) + 1 })); }
      }
      
      const scorer = players.find(p => p.id === newScorerId);
      let finalScorerName = l.scorerName;
      if (newScorerId === 'mercenary') finalScorerName = '용병';
      else if (scorer) {
          finalScorerName = scorer.name;
          if (m.teamAssignments && m.teamAssignments[scorer.id] && m.teamAssignments[scorer.id] !== l.teamLetter) {
              finalScorerName = `(${m.teamAssignments[scorer.id]}팀) ${scorer.name}`;
          }
      }

      const assist = players.find(p => p.id === newAssistId);
      let finalAssistName = l.assistName;
      if (newAssistId === 'mercenary') finalAssistName = '용병';
      else if (assist) {
          finalAssistName = assist.name;
          if (m.teamAssignments && m.teamAssignments[assist.id] && m.teamAssignments[assist.id] !== l.teamLetter) {
              finalAssistName = `(${m.teamAssignments[assist.id]}팀) ${assist.name}`;
          }
      } else if (newAssistId === null) {
          finalAssistName = null;
      }
      
      const updatedLogs = (m.logs || []).map(log => log.id === l.id ? { ...log, scorerId: newScorerId === 'mercenary' ? null : newScorerId, scorerName: finalScorerName, assistId: newAssistId === 'mercenary' ? null : newAssistId, assistName: finalAssistName, isPK: newIsPK, remark: newRemark } : log);
      updatePromises.push(setDoc(doc(db, 'matches', m.id), { ...m, logs: updatedLogs }));
      await Promise.all(updatePromises);
      setLogEditModal({ isOpen: false, match: null, log: null }); setSystemAlert({ isOpen: true, message: '득점 기록이 수정되었습니다.' });
    } finally { setIsProcessing(false); }
  };

  const handleQuarterEditSave = async (e) => {
    e.preventDefault(); if(isProcessing) return; setIsProcessing(true);
    try {
      const fd = new FormData(e.target); const newTeam1 = fd.get('team1'); const newTeam2 = fd.get('team2');
      if (newTeam1 === newTeam2) { setSystemAlert({ isOpen: true, message: '서로 다른 팀을 선택해주세요.' }); setIsProcessing(false); return; }
      const m = matches.find(match => match.id === quarterEditModal.match.id); const qs = quarterEditModal.quarterScore;
      
      let updatedLogs = (m.logs || []).map(log => {
        if (log.quarter === qs.quarter) {
          if (log.teamLetter === qs.team1 && newTeam1 !== qs.team1) return { ...log, teamLetter: newTeam1 };
          if (log.teamLetter === qs.team2 && newTeam2 !== qs.team2) return { ...log, teamLetter: newTeam2 };
        }
        return log;
      });

      const updatedQuarterScores = (m.quarterScores || []).map(q => q.quarter === qs.quarter ? { ...q, team1: newTeam1, team2: newTeam2 } : q);
      await setDoc(doc(db, 'matches', m.id), { ...m, logs: updatedLogs, quarterScores: updatedQuarterScores });
      setQuarterEditModal({ isOpen: false, match: null, quarterScore: null }); setSystemAlert({ isOpen: true, message: '쿼터 정보가 수정되었습니다.\n결과표의 순위는 점수표를 기준으로 재계산됩니다.' });
    } finally { setIsProcessing(false); }
  };

  const handleQuarterDelete = async () => {
    const m = matches.find(match => match.id === quarterEditModal.match.id); const qs = quarterEditModal.quarterScore;
    setSystemConfirm({ isOpen: true, message: `정말 이 쿼터를 미진행(조기종료) 처리하시겠습니까?\n이 쿼터에 기록된 모든 득점/도움 기록이 회수됩니다.`, onConfirm: async () => {
      if(isProcessing) return; setIsProcessing(true);
      try {
        const logsToDelete = (m.logs || []).filter(l => l.quarter === qs.quarter);
        const updatePromises = [];
        let updatedScores = { ...(m.scores || {}) };
        logsToDelete.forEach(l => {
          if (l.scorerId) { const p = players.find(p => p.id === l.scorerId); if (p) updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, goals: Math.max(0, (p.goals || 0) - 1) })); }
          if (l.assistId) { const p = players.find(p => p.id === l.assistId); if (p) updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, assists: Math.max(0, (p.assists || 0) - 1) })); }
          if (updatedScores[l.teamLetter] !== undefined) updatedScores[l.teamLetter] = Math.max(0, updatedScores[l.teamLetter] - 1);
        });
        const updatedLogs = (m.logs || []).filter(l => l.quarter !== qs.quarter);
        const updatedQuarterScores = (m.quarterScores || []).filter(q => q.quarter !== qs.quarter);
        updatePromises.push(setDoc(doc(db, 'matches', m.id), { ...m, logs: updatedLogs, scores: updatedScores, quarterScores: updatedQuarterScores }));
        await Promise.all(updatePromises);
        setQuarterEditModal({ isOpen: false, match: null, quarterScore: null }); setSystemAlert({ isOpen: true, message: `${qs.quarter}쿼터가 미진행 처리되었습니다.` });
      } finally { setIsProcessing(false); }
    }});
  };

  const requestEndQuarter = () => { setSystemConfirm({ isOpen: true, message: '현재 쿼터를 종료하시겠습니까?', onConfirm: () => endQuarter() }); };
  const endQuarter = async (isEarlyEnd = false) => {
    if(isProcessing) return; setIsProcessing(true);
    try {
      let updatedMatch = { ...liveMatch };
      if (!isEarlyEnd) {
        const [t1, t2] = liveState.playingTeams;
        const qScore1 = (liveMatch.logs || []).filter(l => l.quarter === liveState.currentQuarter && l.teamLetter === t1).length;
        const qScore2 = (liveMatch.logs || []).filter(l => l.quarter === liveState.currentQuarter && l.teamLetter === t2).length;
        const newQuarterScore = { quarter: liveState.currentQuarter, team1: t1, team2: t2, score1: qScore1, score2: qScore2 };
        updatedMatch = { ...updatedMatch, quarterScores: [...(liveMatch.quarterScores || []), newQuarterScore] };
      }
      
      if (isEarlyEnd || liveState.currentQuarter >= liveMatch.totalQuarters) {
         const updatePromises = [];
         for (const p of players) { if ((updatedMatch.attendees || []).includes(p.id)) { updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, caps: (p.caps || 0) + 1 })); } }
         updatePromises.push(setDoc(doc(db, 'matches', liveMatchId), { ...updatedMatch, status: 'completed' }));
         await Promise.all(updatePromises);
         setAppState('main'); setLiveMatchId(null);
      } else {
         await setDoc(doc(db, 'matches', liveMatchId), updatedMatch);
         const nextQ = liveState.currentQuarter + 1;
         const stats = updatedMatch.isTournament ? calculateTournamentStandings(updatedMatch) : null;
         const nextTeams = updatedMatch.isTournament ? getTournamentMatchup(nextQ, updatedMatch, stats) : ['A', 'B'];
         setLiveState({ currentQuarter: nextQ, playingTeams: nextTeams, isQuarterActive: false });
      }
    } finally { setIsProcessing(false); }
  };

  const triggerShare = (data) => {
    setShareModal({ isOpen: true, step: 1, data, file: null, imgUrl: null, isVideo: false });
    setTimeout(async () => {
      const captureTarget = document.getElementById('capture-area-hidden');
      if (!captureTarget) return;
      try {
        const html2canvas = await loadHtml2Canvas();
        const canvas = await html2canvas(captureTarget, { scale: 3, useCORS: true, backgroundColor: '#0F172A' });
        canvas.toBlob((blob) => {
          if (!blob) return;
          const file = new File([blob], 'matchboard_result.png', { type: 'image/png' });
          setShareModal(prev => ({ ...prev, step: 2, file, imgUrl: URL.createObjectURL(blob), isVideo: false }));
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

  const doActualShare = async () => {
    const file = shareModal.file; if (!file) return;
    const isKakaotalk = navigator.userAgent.toLowerCase().includes('kakaotalk');
    if (isKakaotalk) { setSystemAlert({ isOpen: true, message: '🚨 카카오톡 브라우저에서는 파일 다이렉트 전송이 제한됩니다.\n\n💡 방법: 하단의 공유버튼(⠇)을 눌러 "다른 브라우저(Safari 등)로 열기"를 한 뒤 공유해주세요.' }); return; }
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ title: 'MATCHBOARD', files: [file] }); } catch (e) { if (e.name !== 'AbortError') { const a = document.createElement('a'); a.href = shareModal.imgUrl; a.download = file.name; a.click(); } }
    } else { const a = document.createElement('a'); a.href = shareModal.imgUrl; a.download = file.name; a.click(); }
  };

  const saveHistory = (newTokens, newDrawings = drawings) => {
    setPastState(prev => [...prev, { tokens: tacticTokens, drawings }].slice(-20)); setFutureState([]);
    setTacticTokens(newTokens); if(newDrawings) setDrawings(newDrawings);
    if (isAutoRecording) setAnimationFrames(prev => [...prev, { tokens: JSON.parse(JSON.stringify(newTokens)), drawings: JSON.parse(JSON.stringify(newDrawings)) }]);
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
      const el = document.getElementById(`token-${draggingToken}`);
      if (el) { el.style.left = `${x}%`; el.style.top = `${y}%`; } 
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
      const el = document.getElementById(`token-${draggingToken}`);
      if (el) {
         const x = parseFloat(el.style.left); const y = parseFloat(el.style.top);
         const downInfo = pointerDownInfo.current;
         const dist = Math.sqrt(Math.pow(e.clientX - downInfo.x, 2) + Math.pow(e.clientY - downInfo.y, 2));
         if (dist < 5 && (Date.now() - downInfo.time) < 250) {
            if (draggingToken !== 'ball') setTokenEditModal({ isOpen: true, token: tacticTokens.find(t => t.id === draggingToken) });
            const orig = dragStartTokensRef.current.find(t => t.id === draggingToken);
            if (orig) { el.style.left = `${orig.x}%`; el.style.top = `${orig.y}%`; }
         } else {
            const newTokens = tacticTokens.map(t => t.id === draggingToken ? { ...t, x, y } : t);
            saveHistory(newTokens);
         }
      }
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
        const yPos = pitchType === 'full' ? (teamLetter === 'A' ? 80 : 20) : (teamLetter === 'A' ? 65 : 35);
        newTeamTokens.push({ id: `${teamLetter}_${Date.now()}_${i}`, position: 'CM', name: '', x: 50, y: yPos, team: teamLetter });
      }
    } else { newTeamTokens.splice(newTeamTokens.length - (currentCount - newCount), currentCount - newCount); }
    saveHistory([...otherTokens, ...newTeamTokens]);
  };

  const exportAnimationToVideo = async () => {
    if (animationFrames.length < 2) return;
    setShareModal({ isOpen: true, step: 1, data: null, file: null, imgUrl: null, isVideo: true });

    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = pitchType === 'full' ? 900 : 800;
    const ctx = canvas.getContext('2d');
    const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
    
    try {
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
      
      ctx.fillStyle = '#047857'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      recorder.start();
      let frameIdx = 0; let progress = 0; const fps = 30; const stepsPerFrame = fps * 0.5; 
      
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
    } catch(e) {
      setSystemAlert({ isOpen: true, message: '이 브라우저 버전에서는 비디오 추출을 지원하지 않습니다.\n대신 [캡처] 버튼을 이용해주세요.' });
      setShareModal({ isOpen: false, step: 1, data: null, file: null, imgUrl: null, isVideo: false });
    }
  };

  const renderQuarterLogsBlock = (match, qs, isAdminView) => {
    const qLogs = (match.logs || []).filter(l => l.quarter === qs.quarter);
    if (qLogs.length === 0) return <div className="text-sm text-slate-500 italic text-center py-2">득점 기록이 없습니다.</div>;
    return (
      <div className="space-y-3">
        {qLogs.map(l => {
          const isLeft = l.teamLetter === qs.team1;
          const canEdit = checkCanEdit(match);
          return (
            <div key={l.id} onClick={() => { if(canEdit) { const enriched = {...l}; if(!enriched.scorerId && enriched.scorerName) enriched.scorerId = players.find(p=>p.name===enriched.scorerName)?.id; if(!enriched.assistId && enriched.assistName) enriched.assistId = players.find(p=>p.name===enriched.assistName)?.id; setLogEditModal({isOpen: true, match, log: enriched}); } }} className={`flex items-start gap-2 w-full ${isLeft ? 'flex-row' : 'flex-row-reverse'} ${canEdit ? 'cursor-pointer hover:bg-slate-800 p-1 rounded-lg transition -mx-1 px-1' : ''}`}>
              <span className="text-slate-600 text-[10px] w-8 shrink-0 text-center mt-1">{l.time}</span>
              <div className={`flex flex-col ${isLeft ? 'items-start' : 'items-end'}`}>
                <div className="text-white font-bold text-sm flex items-center gap-1">
                  <span className={TEAM_TEXT_COLORS[l.teamLetter]}>⚽</span> {l.scorerName}
                  {l.isPK && <span className="text-[9px] bg-red-500/20 text-red-400 px-1 py-0.5 rounded ml-1 border border-red-500/30">PK</span>}
                </div>
                {l.remark && <div className="text-[11px] bg-slate-800/80 px-2 py-1 rounded text-slate-300 mt-1 inline-block border border-slate-700">{l.remark}</div>}
                {l.assistName && <div className="text-slate-400 mt-1 flex items-center gap-1"><Footprints size={12} className="text-slate-500"/> <span className="text-xs">{l.assistName}</span></div>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderStandingsTableBlock = (match) => {
    const isTour = match.isTournament;
    const standings = isTour ? calculateTournamentStandings(match) : calculateStandings(match);
    
    if (isTour) {
      return (
        <table className="w-full text-xs text-center">
          <thead>
            <tr className="text-slate-500 font-bold border-b border-slate-700/50">
              <th className="pb-2">순위</th><th className="pb-2 text-left">팀</th><th className="pb-2">총점</th><th className="pb-2">1S</th><th className="pb-2">2S</th><th className="pb-2">3S</th><th className="pb-2">득실</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((st, i) => (
              <tr key={st.team} className="border-t border-slate-800/50">
                <td className={`py-2 font-black ${i === 0 ? 'text-yellow-400' : 'text-slate-400'}`}>{i + 1}</td>
                <td className={`py-2 text-left font-bold ${TEAM_TEXT_COLORS[st.team]}`}>{getTeamDisplayName(match, st.team)}</td>
                <td className="py-2 text-blue-400 font-black">{st.setPts}</td>
                <td className="py-2 text-white">{st.s1 || '-'}</td>
                <td className="py-2 text-white">{st.s2 || '-'}</td>
                <td className="py-2 text-white">{st.s3 || '-'}</td>
                <td className="py-2 text-white">{st.gd > 0 ? '+'+st.gd : st.gd}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    
    return (
      <table className="w-full text-xs text-center">
        <thead>
          <tr className="text-slate-500 font-bold border-b border-slate-700/50">
            <th className="pb-2">순위</th><th className="pb-2 text-left">팀</th><th className="pb-2">승점</th><th className="pb-2">승</th><th className="pb-2">무</th><th className="pb-2">패</th><th className="pb-2">득실</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((st, i) => (
            <tr key={st.team} className="border-t border-slate-800/50">
              <td className={`py-2 font-black ${i === 0 ? 'text-yellow-400' : 'text-slate-400'}`}>{i + 1}</td>
              <td className={`py-2 text-left font-bold ${TEAM_TEXT_COLORS[st.team]}`}>{getTeamDisplayName(match, st.team)}</td>
              <td className="py-2 text-blue-400 font-black">{st.pts}</td>
              <td className="py-2 text-white">{st.w}</td>
              <td className="py-2 text-slate-400">{st.d}</td>
              <td className="py-2 text-slate-400">{st.l}</td>
              <td className="py-2 text-white">{st.gd > 0 ? '+'+st.gd : st.gd}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderQuartersList = (match) => {
    if (match.isTournament) {
      let elements = [];
      for (let setNum = 1; setNum <= 3; setNum++) {
        const setQuarters = [1, 2, 3, 4].map(i => (setNum - 1) * 4 + i);
        const playedInSet = (match.quarterScores || []).filter(qs => setQuarters.includes(qs.quarter));
        if (playedInSet.length === 0) {
          elements.push(
            <div key={`set-${setNum}`} className="bg-slate-800/30 rounded-2xl p-4 border border-slate-700/50 border-dashed mb-4 flex justify-center items-center h-20">
              <span className="text-slate-500 font-bold text-[13px]">{setNum}세트 전체 - 미진행 (조기종료)</span>
            </div>
          );
        } else {
          setQuarters.forEach(qNum => {
            const qs = playedInSet.find(q => q.quarter === qNum);
            if (qs) {
              const { title } = getTournamentQuarterInfo(qs.quarter);
              elements.push(
                <div key={qs.quarter} className="bg-slate-900 rounded-2xl p-4 border border-slate-700 mb-4">
                  <div className="relative flex justify-center items-center border-b border-slate-800 pb-3 mb-3">
                    <span className="absolute left-0 font-black text-blue-400 text-xs">{title}</span>
                    <span className="font-bold text-white text-lg flex items-center">
                      <span className={TEAM_TEXT_COLORS[qs.team1]}>{getTeamDisplayName(match, qs.team1)}</span> 
                      <span className="text-slate-500 mx-3">{qs.score1} : {qs.score2}</span> 
                      <span className={TEAM_TEXT_COLORS[qs.team2]}>{getTeamDisplayName(match, qs.team2)}</span>
                    </span>
                    {checkCanEdit(match) && (
                      <button onClick={() => setQuarterEditModal({isOpen: true, match, quarterScore: qs})} className="absolute right-0 text-slate-500 p-1 bg-slate-800 rounded-md"><Edit size={14}/></button>
                    )}
                  </div>
                  {renderQuarterLogsBlock(match, qs, true)}
                  {checkCanEdit(match) && (
                    <div className="flex justify-center mt-4 pt-4 border-t border-slate-800/50">
                      <button onClick={() => setGoalFlow({ isOpen: true, step: 1, matchId: match.id, quarter: qs.quarter, teamLetter: qs.team1, availableTeams: [qs.team1, qs.team2], scorer: null, isPK: false, remark: '', isMissingAdd: true })} className="text-[11px] bg-slate-800 text-slate-400 px-3 py-1.5 rounded-lg flex items-center gap-1"><Plus size={12}/> 누락된 득점 추가</button>
                    </div>
                  )}
                </div>
              );
            } else {
              elements.push(
                <div key={`q-${qNum}`} className="bg-slate-800/30 rounded-xl p-3 border border-slate-700/50 border-dashed mb-4 flex justify-center items-center">
                  <span className="text-slate-500 font-bold text-xs">{getTournamentQuarterInfo(qNum).title} - 미진행</span>
                </div>
              );
            }
          });
        }
      }
      return elements;
    } else {
      let elements = [];
      for (let i = 1; i <= match.totalQuarters; i++) {
        const qs = (match.quarterScores || []).find(q => q.quarter === i);
        if (qs) {
          elements.push(
            <div key={qs.quarter} className="bg-slate-900 rounded-2xl p-4 border border-slate-700 mb-4">
              <div className="relative flex justify-center items-center border-b border-slate-800 pb-3 mb-3">
                <span className="absolute left-0 font-black text-blue-400">{qs.quarter}Q</span>
                <span className="font-bold text-white text-lg flex items-center">
                  <span className={TEAM_TEXT_COLORS[qs.team1]}>{getTeamDisplayName(match, qs.team1)}</span> 
                  <span className="text-slate-500 mx-3">{qs.score1} : {qs.score2}</span> 
                  <span className={TEAM_TEXT_COLORS[qs.team2]}>{getTeamDisplayName(match, qs.team2)}</span>
                </span>
                {checkCanEdit(match) && (
                  <button onClick={() => setQuarterEditModal({isOpen: true, match, quarterScore: qs})} className="absolute right-0 text-slate-500 p-1 bg-slate-800 rounded-md"><Edit size={14}/></button>
                )}
              </div>
              {renderQuarterLogsBlock(match, qs, true)}
              {checkCanEdit(match) && (
                <div className="flex justify-center mt-4 pt-4 border-t border-slate-800/50">
                  <button onClick={() => setGoalFlow({ isOpen: true, step: 1, matchId: match.id, quarter: qs.quarter, teamLetter: qs.team1, availableTeams: [qs.team1, qs.team2], scorer: null, isPK: false, remark: '', isMissingAdd: true })} className="text-[11px] bg-slate-800 text-slate-400 px-3 py-1.5 rounded-lg flex items-center gap-1"><Plus size={12}/> 누락된 득점 추가</button>
                </div>
              )}
            </div>
          );
        } else if (match.status === 'completed') {
          elements.push(
            <div key={`q-${i}`} className="bg-slate-800/30 rounded-xl p-3 border border-slate-700/50 border-dashed mb-4 flex justify-center items-center">
              <span className="text-slate-500 font-bold text-xs">{i}Q 미진행 (조기종료)</span>
            </div>
          );
        }
      }
      return elements;
    }
  };

  const renderSystemModals = () => (
    <>
      {systemAlert.isOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[210] p-4">
          <div className="bg-slate-800 p-6 rounded-2xl max-w-sm w-full border border-slate-700 shadow-xl text-center animate-in fade-in zoom-in-95 duration-200">
            <p className="text-white font-bold mb-6 whitespace-pre-line">{systemAlert.message}</p>
            <button onClick={() => setSystemAlert({isOpen: false, message: ''})} className="w-full py-3 bg-blue-500 hover:bg-blue-400 transition text-white rounded-xl font-bold">확인</button>
          </div>
        </div>
      )}
      {systemConfirm.isOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[210] p-4">
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
            <p className="text-white font-bold text-sm tracking-wide">데이터 처리 중...</p>
          </div>
        </div>
      )}
    </>
  );

  const renderQuarterEditModal = () => {
    if (!quarterEditModal.isOpen || !quarterEditModal.match || !quarterEditModal.quarterScore) return null;
    const m = quarterEditModal.match; const qs = quarterEditModal.quarterScore; const maxTeams = getMatchTeamCount(m);
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[150] animate-in fade-in">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2"><Edit size={18}/> {qs.quarter}Q 출전 팀 수정</h2>
            <button onClick={() => setQuarterEditModal({isOpen: false, match: null, quarterScore: null})} className="text-slate-400 hover:text-white"><X size={20}/></button>
          </div>
          <form onSubmit={handleQuarterEditSave} className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-400 mb-2 text-center">홈 팀</label>
                <select name="team1" defaultValue={qs.team1} className={`w-full bg-slate-900 border border-slate-700 p-3 rounded-xl outline-none font-bold text-center ${TEAM_TEXT_COLORS[qs.team1]}`}>
                  {TEAM_LETTERS.slice(0, maxTeams).map(t => <option key={t} value={t} className={TEAM_TEXT_COLORS[t]}>{t}팀</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-400 mb-2 text-center">원정 팀</label>
                <select name="team2" defaultValue={qs.team2} className={`w-full bg-slate-900 border border-slate-700 p-3 rounded-xl outline-none font-bold text-center ${TEAM_TEXT_COLORS[qs.team2]}`}>
                  {TEAM_LETTERS.slice(0, maxTeams).map(t => <option key={t} value={t} className={TEAM_TEXT_COLORS[t]}>{t}팀</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-2 border-t border-slate-700">
              <button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">수정 저장</button>
            </div>
            <button type="button" onClick={handleQuarterDelete} className="w-full py-3 mt-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-bold text-sm flex items-center justify-center gap-1"><Trash2 size={16}/> 이 기록 삭제 및 미진행 처리하기</button>
          </form>
        </div>
      </div>
    );
  };

  const renderDetailModal = () => {
    if (!detailModal.isOpen || !detailMatch) return null;
    const actualTeamCount = getMatchTeamCount(detailMatch);
    
    return (
      <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-[100] animate-in fade-in">
        <div className="bg-slate-800 rounded-3xl w-full max-w-md border border-slate-700 max-h-[85vh] flex flex-col shadow-xl overflow-hidden">
          <div className="p-6 border-b border-slate-700 bg-slate-900 shrink-0">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${detailMatch.matchType === 'external' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : detailMatch.matchType === 'futsal' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'}`}>
                    {detailMatch.matchType === 'external' ? '교류전' : detailMatch.matchType === 'futsal' ? '풋살' : '자체전'}
                  </span>
                  {detailMatch.isTournament && <span className="text-[10px] font-bold bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded border border-yellow-500/30">토너먼트</span>}
                  <h2 className="text-lg font-black text-white">{detailMatch.date} 결과</h2>
                </div>
                <p className="text-sm text-slate-400"><MapPin size={12} className="inline mr-1"/>{detailMatch.location}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => triggerShare(detailMatch)} className="text-yellow-500 bg-slate-800 p-2 rounded-full hover:bg-slate-700 transition"><Share2 size={20}/></button>
                <button onClick={() => { setDetailModal({isOpen: false, match: null}); setDetailModalMatchId(null); }} className="text-slate-400 bg-slate-800 p-2 rounded-full hover:text-white transition"><X size={20}/></button>
              </div>
            </div>
            {checkCanEdit(detailMatch) && (
              <button onClick={() => { setDetailModal({isOpen: false, match: null}); setDetailModalMatchId(null); openMatchModal(detailMatch); }} className="w-full mt-3 bg-slate-800 text-blue-400 py-2 rounded-xl text-xs font-bold border border-blue-500/30 hover:bg-slate-700 transition flex items-center justify-center gap-1">
                <Edit size={14}/> 경기 설정 (타입 / 장소 / 명단) 변경
              </button>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 hide-scrollbar space-y-6">
            <div className="bg-slate-900 rounded-2xl p-4 border border-slate-700">
              <div className="text-xs text-slate-400 mb-3 font-bold border-b border-slate-800 pb-2">순위표</div>
              {renderStandingsTableBlock(detailMatch)}
            </div>
            <div className="space-y-4">
              {renderQuartersList(detailMatch)}
            </div>
            <div className="bg-slate-900 rounded-2xl p-4 border border-slate-700">
              <div className="text-xs text-slate-400 mb-4 font-bold border-b border-slate-800 pb-2 flex justify-between items-end">
                  <span>참석자 최종 편성 명단</span>
                  {checkCanEdit(detailMatch) && (
                    <button onClick={() => { setDetailModal({isOpen: false, match: null}); setDetailModalMatchId(null); setAssignmentModal({ isOpen: true, match: detailMatch }); }} className="bg-slate-800 text-purple-400 px-2.5 py-1 rounded text-[10px] font-bold border border-purple-500/30 flex items-center gap-1 hover:bg-slate-700 transition">
                      <Users size={12}/> 편성 수정
                    </button>
                  )}
              </div>
              <div className="space-y-4">
                {TEAM_LETTERS.slice(0, actualTeamCount).map(teamLetter => {
                  const teamPlayers = players.filter(p => (detailMatch.attendees || []).includes(p.id) && ((detailMatch.teamAssignments || {})[p.id]) === teamLetter);
                  if(teamPlayers.length === 0) return null;
                  return (
                    <div key={teamLetter}>
                      <div className={`text-[11px] font-black mb-2 ${TEAM_TEXT_COLORS[teamLetter]}`}>{getTeamDisplayName(detailMatch, teamLetter)}</div>
                      <div className="flex flex-wrap gap-2">
                        {teamPlayers.map(p => (
                          <div key={p.id} className="bg-slate-800 px-3.5 py-2.5 rounded-full border border-slate-600/50 flex items-center">
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
  };

  const renderHiddenCaptureArea = () => {
    if (!shareModal.isOpen || !shareModal.data || shareModal.isVideo) return null;
    const shareMatch = shareModal.data;
    const actualTeamCount = getMatchTeamCount(shareMatch);
    
    return (
      <div className="fixed top-0 left-0 w-[960px] opacity-0 pointer-events-none z-[-100] overflow-visible">
        <div id="capture-area-hidden" className="bg-slate-900 p-12 w-full flex flex-col items-center text-left text-slate-200 border-none pb-16">
          <div className="mb-8 w-full pb-6 border-b border-slate-700">
            <h3 className="font-black text-white text-5xl leading-tight mb-4">
               {shareMatch.matchType === 'external' ? `[교류전] vs ${shareMatch.opponentName}` : shareMatch.matchType === 'futsal' ? `[풋살] ${shareMatch.location}` : `[자체전] ${shareMatch.location}`}
            </h3>
            <p className="text-slate-400 text-2xl font-medium">
               {new Date(shareMatch.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} {formatTimeAmPm(shareMatch.time)} · 참석 {(shareMatch.attendees || []).length}명
            </p>
          </div>
          <div className="w-full bg-slate-800 rounded-3xl p-8 mb-8 border border-slate-700/50 shadow-md">
             <div className="font-black text-slate-400 text-2xl border-b border-slate-700/50 pb-4 mb-6">순위표 {shareMatch.isTournament && <span className="text-yellow-400 text-lg ml-2">(토너먼트 룰 적용)</span>}</div>
             {shareMatch.isTournament ? (
               <table className="w-full text-2xl text-center">
                 <thead>
                   <tr className="text-slate-500 font-bold">
                     <th className="pb-6">순위</th><th className="pb-6 text-left">팀</th><th className="pb-6">총점</th><th className="pb-6">1S</th><th className="pb-6">2S</th><th className="pb-6">3S</th><th className="pb-6">득실차</th>
                   </tr>
                 </thead>
                 <tbody>
                   {calculateTournamentStandings(shareMatch).map((st, i) => (
                     <tr key={st.team} className="border-t border-slate-700/30 text-slate-300">
                       <td className={`py-6 font-black ${i === 0 ? 'text-yellow-400' : 'text-slate-400'}`}>{i + 1}</td>
                       <td className={`py-6 font-bold text-left ${TEAM_TEXT_COLORS[st.team]}`}>{getTeamDisplayName(shareMatch, st.team)}</td>
                       <td className="py-6 text-blue-400 font-black">{st.setPts}</td>
                       <td className="py-6 text-white">{st.s1 || '-'}</td>
                       <td className="py-6 text-white">{st.s2 || '-'}</td>
                       <td className="py-6 text-white">{st.s3 || '-'}</td>
                       <td className="py-6 text-white">{st.gd > 0 ? '+'+st.gd : st.gd}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             ) : (
               <table className="w-full text-2xl text-center">
                 <thead>
                   <tr className="text-slate-500 font-bold">
                     <th className="pb-6">순위</th><th className="pb-6 text-left">팀</th><th className="pb-6">승점</th><th className="pb-6">승</th><th className="pb-6">무</th><th className="pb-6">패</th><th className="pb-6">득</th><th className="pb-6">실</th><th className="pb-6">득실차</th>
                   </tr>
                 </thead>
                 <tbody>
                   {calculateStandings(shareMatch).map((st, i) => (
                     <tr key={st.team} className="border-t border-slate-700/30 text-slate-300">
                       <td className={`py-6 font-black ${i === 0 ? 'text-yellow-400' : 'text-slate-400'}`}>{i + 1}</td>
                       <td className={`py-6 font-bold text-left ${TEAM_TEXT_COLORS[st.team]}`}>{getTeamDisplayName(shareMatch, st.team)}</td>
                       <td className="py-6 text-blue-400 font-black">{st.pts}</td>
                       <td className="py-6 text-white">{st.w}</td>
                       <td className="py-6 text-slate-400">{st.d}</td>
                       <td className="py-6 text-slate-400">{st.l}</td>
                       <td className="py-6 text-white">{st.gf}</td>
                       <td className="py-6 text-slate-400">{st.ga}</td>
                       <td className="py-6 text-white">{st.gd > 0 ? '+'+st.gd : st.gd}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             )}
          </div>
          <div className="w-full mb-8 grid grid-cols-2 gap-8">
               {shareMatch.isTournament ? (() => {
                  let elements = [];
                  for (let setNum = 1; setNum <= 3; setNum++) {
                    const setQuarters = [1, 2, 3, 4].map(i => (setNum - 1) * 4 + i);
                    const playedInSet = (shareMatch.quarterScores || []).filter(qs => setQuarters.includes(qs.quarter));
                    if (playedInSet.length === 0) {
                      elements.push(
                        <div key={`set-${setNum}`} className="bg-slate-800/30 rounded-3xl p-8 border border-slate-700/50 border-dashed col-span-2 flex justify-center items-center py-12">
                          <span className="text-slate-500 font-bold text-2xl">{setNum}세트 전체 - 미진행 (조기종료)</span>
                        </div>
                      );
                    } else {
                      setQuarters.forEach(qNum => {
                        const qs = playedInSet.find(q => q.quarter === qNum);
                        if (qs) {
                          const qLogs = (shareMatch.logs || []).filter(l => l.quarter === qs.quarter);
                          const { title } = getTournamentQuarterInfo(qs.quarter);
                          elements.push(
                            <div key={qs.quarter} className="w-full bg-slate-800 rounded-3xl p-8 border border-slate-700/50 shadow-md">
                               <div className="flex flex-col items-center border-b border-slate-700/50 pb-6 mb-6">
                                 <span className="font-black text-blue-400 text-2xl mb-3">{title}</span>
                                 <span className="font-black text-white text-3xl text-center flex items-center justify-center w-full">
                                   <span className={`${TEAM_TEXT_COLORS[qs.team1]} flex-1 text-right`}>{getTeamDisplayName(shareMatch, qs.team1)}</span> 
                                   <span className="text-slate-500 mx-5 shrink-0">{qs.score1} : {qs.score2}</span> 
                                   <span className={`${TEAM_TEXT_COLORS[qs.team2]} flex-1 text-left`}>{getTeamDisplayName(shareMatch, qs.team2)}</span>
                                 </span>
                               </div>
                               <div className="space-y-6">
                                 {qLogs.length > 0 ? qLogs.map(l => {
                                   const isLeft = l.teamLetter === qs.team1;
                                   return (
                                     <div key={l.id} className={`flex items-start gap-5 w-full ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}>
                                       <span className="text-slate-500 text-xl w-16 shrink-0 text-center mt-1">{l.time}</span>
                                       <div className={`flex flex-col ${isLeft ? 'items-start' : 'items-end'}`}>
                                         <div className="text-slate-100 font-bold text-2xl flex items-center gap-2">
                                           <span className={TEAM_TEXT_COLORS[l.teamLetter]}>⚽</span> {l.scorerName}
                                           {l.isPK && <span className="text-base bg-red-500/20 text-red-400 px-2 py-1 rounded ml-2 border border-red-500/30">PK</span>}
                                         </div>
                                         {l.remark && <div className="text-lg bg-slate-900/80 px-4 py-2 rounded-lg text-slate-300 mt-2 inline-block border border-slate-700/50">{l.remark}</div>}
                                         {l.assistName && (
                                           <div className="text-slate-500 mt-2 flex items-center gap-2">
                                             <Footprints size={20} className="text-slate-500"/> <span className="text-xl">{l.assistName}</span>
                                           </div>
                                         )}
                                       </div>
                                     </div>
                                   )
                                 }) : <div className="text-xl text-slate-500 text-center py-6 italic">득점 기록이 없습니다.</div>}
                               </div>
                            </div>
                          );
                        } else {
                          elements.push(
                            <div key={`q-${qNum}`} className="bg-slate-800/30 rounded-3xl p-6 border border-slate-700/50 border-dashed flex justify-center items-center">
                              <span className="text-slate-500 font-bold text-xl">{getTournamentQuarterInfo(qNum).title} - 미진행</span>
                            </div>
                          );
                        }
                      });
                    }
                  }
                  return elements;
               })() : (
                 (shareMatch.quarterScores || []).length > 0 ? (shareMatch.quarterScores || []).map(qs => {
                   const qLogs = (shareMatch.logs || []).filter(l => l.quarter === qs.quarter);
                   return (
                     <div key={qs.quarter} className="w-full bg-slate-800 rounded-3xl p-8 border border-slate-700/50 shadow-md">
                        <div className="flex flex-col items-center border-b border-slate-700/50 pb-6 mb-6">
                          <span className="font-black text-blue-400 text-2xl mb-3">{qs.quarter}Q</span>
                          <span className="font-black text-white text-3xl text-center flex items-center justify-center w-full">
                            <span className={`${TEAM_TEXT_COLORS[qs.team1]} flex-1 text-right`}>{getTeamDisplayName(shareMatch, qs.team1)}</span> 
                            <span className="text-slate-500 mx-5 shrink-0">{qs.score1} : {qs.score2}</span> 
                            <span className={`${TEAM_TEXT_COLORS[qs.team2]} flex-1 text-left`}>{getTeamDisplayName(shareMatch, qs.team2)}</span>
                          </span>
                        </div>
                        <div className="space-y-6">
                          {qLogs.length > 0 ? qLogs.map(l => {
                            const isLeft = l.teamLetter === qs.team1;
                            return (
                              <div key={l.id} className={`flex items-start gap-5 w-full ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}>
                                <span className="text-slate-500 text-xl w-16 shrink-0 text-center mt-1">{l.time}</span>
                                <div className={`flex flex-col ${isLeft ? 'items-start' : 'items-end'}`}>
                                  <div className="text-slate-100 font-bold text-2xl flex items-center gap-2">
                                    <span className={TEAM_TEXT_COLORS[l.teamLetter]}>⚽</span> {l.scorerName}
                                    {l.isPK && <span className="text-base bg-red-500/20 text-red-400 px-2 py-1 rounded ml-2 border border-red-500/30">PK</span>}
                                  </div>
                                  {l.remark && <div className="text-lg bg-slate-900/80 px-4 py-2 rounded-lg text-slate-300 mt-2 inline-block border border-slate-700/50">{l.remark}</div>}
                                  {l.assistName && <div className="text-slate-500 mt-2 flex items-center gap-2"><Footprints size={20} className="text-slate-500"/> <span className="text-xl">{l.assistName}</span></div>}
                                </div>
                              </div>
                            )
                          }) : <div className="text-xl text-slate-500 text-center py-6 italic">득점 기록이 없습니다.</div>}
                        </div>
                     </div>
                   )
                 }) : <div className="text-2xl text-slate-500 text-center py-10 bg-slate-800 rounded-3xl border border-slate-700/50 shadow-md col-span-2">아직 기록이 없습니다.</div>
               )}
          </div>
          <div className="w-full bg-slate-800 rounded-3xl p-8 border border-slate-700/50 shadow-md">
              <div className="text-2xl text-slate-400 mb-6 font-black border-b border-slate-700/50 pb-4">참석자 최종 편성 명단</div>
              <div className="space-y-8">
                {TEAM_LETTERS.slice(0, actualTeamCount).map(teamLetter => {
                  const teamPlayers = players.filter(p => (shareMatch.attendees || []).includes(p.id) && ((shareMatch.teamAssignments || {})[p.id]) === teamLetter);
                  if(teamPlayers.length === 0) return null;
                  return (
                    <div key={teamLetter}>
                      <div className={`text-xl font-black mb-4 ${TEAM_TEXT_COLORS[teamLetter]}`}>{getTeamDisplayName(shareMatch, teamLetter)}</div>
                      <div className="flex flex-wrap gap-4">
                        {teamPlayers.map(p => (
                          <div key={p.id} className="bg-slate-900 px-5 py-3 rounded-full border border-slate-600/50 flex items-center">
                            <span className="font-bold text-white text-xl tracking-wide">{p.name}</span>
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
  };

  const renderMatchModalForm = () => {
    if (!matchModal.isOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-end justify-center z-[100]">
        <div className="bg-slate-800 p-6 rounded-t-3xl w-full max-w-md border-t border-slate-700 animate-in slide-in-from-bottom max-h-[90vh] flex flex-col shadow-xl">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <h2 className="text-xl font-bold text-white">{matchModal.match ? '일정 수정' : '새 일정 등록'}</h2>
            <button onClick={() => setMatchModal({isOpen: false, match: null})} className="text-slate-400 hover:text-white"><X size={24}/></button>
          </div>
          <div className="flex bg-slate-900 rounded-xl p-1 mb-4 shrink-0 overflow-x-auto hide-scrollbar">
             <button type="button" onClick={() => setMatchTypeForm('internal')} className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-bold transition whitespace-nowrap ${matchTypeForm === 'internal' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-400'}`}>자체전</button>
             <button type="button" onClick={() => setMatchTypeForm('external')} className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-bold transition whitespace-nowrap ${matchTypeForm === 'external' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-400'}`}>교류전</button>
             <button type="button" onClick={() => setMatchTypeForm('futsal')} className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-bold transition whitespace-nowrap ${matchTypeForm === 'futsal' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-400'}`}>풋살</button>
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
            {matchTypeForm === 'external' && (
              <div>
                <label className="block text-xs font-bold text-purple-400 mb-1">상대팀 이름</label>
                <input type="text" name="opponentName" required defaultValue={matchModal.match?.opponentName || ""} className="w-full bg-slate-900 border border-purple-500/50 p-3 rounded-xl text-white outline-none" />
              </div>
            )}
            <div className="flex gap-4">
              {(matchTypeForm === 'internal' || matchTypeForm === 'futsal') && (
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-400 mb-1">총 팀 개수</label>
                  <select name="teamCount" id="teamCountSelect" defaultValue={matchModal.match?.teamCount || 2} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" onChange={(e)=>{
                    const isTourRow = document.getElementById('isTournamentRow'); const chk = document.getElementById('isTournamentChk'); const qInput = document.getElementById('totalQuartersInput');
                    if(e.target.value === '4') { if(isTourRow) isTourRow.style.display = 'flex'; }
                    else { if(isTourRow) isTourRow.style.display = 'none'; if(chk) chk.checked = false; if(qInput) qInput.readOnly = false; }
                  }}>
                    <option value="2">2팀 (A,B)</option><option value="3">3팀 (A,B,C)</option><option value="4">4팀 (A,B,C,D)</option>
                  </select>
                </div>
              )}
              <div className={matchTypeForm === 'external' ? 'w-full' : 'flex-1'}>
                <label className="block text-xs font-bold text-slate-400 mb-1">총 쿼터 수</label>
                <input type="number" id="totalQuartersInput" name="totalQuarters" required defaultValue={matchModal.match?.totalQuarters || 4} min="1" max="20" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" />
              </div>
            </div>
            
            {(matchTypeForm === 'internal' || matchTypeForm === 'futsal') && (
              <div id="isTournamentRow" className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-xl" style={{ display: (matchModal.match?.teamCount == 4 || (document.getElementById('teamCountSelect')?.value == '4')) ? 'flex' : 'none' }}>
                <input type="checkbox" id="isTournamentChk" name="isTournament" value="true" defaultChecked={matchModal.match?.isTournament} className="w-5 h-5 accent-yellow-500" onChange={(e)=>{
                  const qInput = document.getElementById('totalQuartersInput');
                  if(e.target.checked) { if(qInput) { qInput.value = 12; qInput.readOnly = true; } }
                  else { if(qInput) qInput.readOnly = false; }
                }} />
                <div>
                  <div className="text-sm font-bold text-yellow-400 flex items-center gap-1"><Trophy size={16}/> 4팀 3세트 토너먼트 모드</div>
                  <div className="text-[10px] text-yellow-500/70">체크 시 총 12쿼터 고정 및 승점 로직이 적용됩니다.</div>
                </div>
              </div>
            )}
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-400 mb-2">참석자 체크</label>
              <div className="grid grid-cols-2 gap-2">
                {currentTeamPlayers.map(p => (
                  <label key={p.id} className="flex items-center gap-2 bg-slate-900 p-3 rounded-lg border border-slate-700 cursor-pointer hover:border-slate-500">
                    <input type="checkbox" name={`attendee_${p.id}`} defaultChecked={matchModal.match ? (matchModal.match.attendees || []).includes(p.id) : false} className="accent-blue-500 w-4 h-4 rounded" />
                    <span className="text-sm font-bold text-white">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </form>
          <div className="pt-4 shrink-0 border-t border-slate-700">
            <button type="submit" form="matchForm" className="w-full py-4 bg-blue-500 hover:bg-blue-400 text-white rounded-xl font-bold text-lg shadow-lg">저장하기</button>
          </div>
        </div>
      </div>
    );
  };

  const renderAssignmentModal = () => {
    if (!assignmentModal.isOpen || !assignmentModal.match) return null;
    const maxTeams = getMatchTeamCount(assignmentModal.match);
    
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[150]">
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
                    {TEAM_LETTERS.slice(0, maxTeams).map(t => (
                      <button key={t} onClick={() => assignTeam(p.id, t)} className={`w-8 h-8 flex items-center justify-center text-xs font-black rounded-md transition ${currentTeam === t ? TEAM_COLORS[t] + ' shadow' : 'bg-slate-700 text-slate-400 hover:text-white'}`}>{t}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderGoalFlowModal = () => {
    if (!goalFlow.isOpen) return null;
    const selectedTeamPlayers = players.filter(p => p.teamId === activeTeamId && (liveMatch?.attendees || []).includes(p.id) && ((liveMatch?.teamAssignments || {})[p.id]) === goalFlow.teamLetter);
    const otherPlayers = players.filter(p => p.teamId === activeTeamId && (liveMatch?.attendees || []).includes(p.id) && ((liveMatch?.teamAssignments || {})[p.id]) !== goalFlow.teamLetter);
    return (
      <div className="fixed inset-0 bg-black/80 flex items-end justify-center z-[150]">
        <div className="bg-slate-800 p-6 rounded-t-3xl w-full max-w-md border-t border-slate-700 animate-in slide-in-from-bottom">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-black text-white flex items-center gap-2"><Trophy size={18} className="text-yellow-400"/> {goalFlow.step === 1 ? '득점자 선택' : '어시스트 선택'}</h2>
            <button onClick={() => {setGoalFlow({ isOpen: false, step: 1, matchId: null, quarter: null, teamLetter: null, availableTeams: [], scorer: null, isPK: false, remark: '', isMissingAdd: false }); setShowOtherTeams(false);}} className="text-slate-400 hover:text-white"><X size={20}/></button>
          </div>
          <div className="mb-4">
            <div className="flex justify-between items-center mb-3">
              <div className="text-sm font-bold text-slate-400">{getTeamDisplayName(liveMatch, goalFlow.teamLetter)} 명단</div>
              {liveMatch?.matchType !== 'external' && (
                <button onClick={() => setShowOtherTeams(!showOtherTeams)} className={`text-[11px] px-2 py-1 rounded border font-bold transition ${showOtherTeams ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                  🔄 타팀 지원 {showOtherTeams ? '닫기' : '보기'}
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto hide-scrollbar">
              {selectedTeamPlayers.map(p => (
                <button key={p.id} onClick={() => handleGoalSubmit(p.id, goalFlow.teamLetter)} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl border border-slate-600 transition text-sm">{p.name}</button>
              ))}
            </div>
            {showOtherTeams && (
              <div className="mt-4 pt-3 border-t border-slate-700">
                <div className="text-xs font-bold text-slate-500 mb-2">타팀 인원 (지원)</div>
                <div className="grid grid-cols-3 gap-2 max-h-32 overflow-y-auto hide-scrollbar">
                  {otherPlayers.map(p => (
                    <button key={p.id} onClick={() => handleGoalSubmit(p.id, goalFlow.teamLetter)} className="bg-slate-900 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded-xl border border-slate-700 transition text-xs truncate px-1">
                      {p.name} <span className="text-[9px] text-slate-500">({(liveMatch?.teamAssignments || {})[p.id]}팀)</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="space-y-2 mt-4 pt-4 border-t border-slate-700">
             <button onClick={() => handleGoalSubmit('mercenary', goalFlow.teamLetter)} className="w-full bg-slate-900 border border-slate-600 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm transition">
               👤 용병 (팀 외 인원) {goalFlow.step === 1 ? '득점' : '도움'}
             </button>
             {goalFlow.step === 1 ? (
               <button onClick={() => handleGoalSubmit(null, goalFlow.teamLetter)} className="w-full bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-400 font-bold py-3 rounded-xl text-sm transition">상대팀 자책골</button>
             ) : (
               <button onClick={() => handleGoalSubmit(null, goalFlow.teamLetter)} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl shadow-lg text-sm transition">도움 없음 (단독 득점)</button>
             )}
          </div>
        </div>
      </div>
    );
  };

  const renderLogEditModal = () => {
    if (!logEditModal.isOpen || !logEditModal.match || !logEditModal.log) return null;
    const m = logEditModal.match; const l = logEditModal.log;
    const teamPlayers = players.filter(p => p.teamId === activeTeamId && (m.attendees || []).includes(p.id) && ((m.teamAssignments || {})[p.id]) === l.teamLetter);
    const otherPlayers = players.filter(p => p.teamId === activeTeamId && (m.attendees || []).includes(p.id) && ((m.teamAssignments || {})[p.id]) !== l.teamLetter);
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[150] animate-in fade-in">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2"><Edit size={18}/> 득점 기록 수정</h2>
            <button onClick={() => setLogEditModal({isOpen: false, match: null, log: null})} className="text-slate-400 hover:text-white"><X size={20}/></button>
          </div>
          <form onSubmit={handleLogEditSave} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">득점자</label>
              <select name="scorerId" defaultValue={l.scorerName === '용병' ? 'mercenary' : (l.scorerId || 'none')} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none">
                <option value="none">자책골 / 기타</option>
                <optgroup label="우리 팀"><option value="mercenary">👤 용병 (팀 외 인원)</option>{teamPlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
                {m.matchType !== 'external' && <optgroup label="타팀 지원">{otherPlayers.map(p => <option key={p.id} value={p.id}>({(m.teamAssignments || {})[p.id]}팀) {p.name}</option>)}</optgroup>}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">도움 (어시스트)</label>
              <select name="assistId" defaultValue={l.assistName === '용병' ? 'mercenary' : (l.assistId || 'none')} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none">
                <option value="none">없음</option>
                <optgroup label="우리 팀"><option value="mercenary">👤 용병 (팀 외 인원)</option>{teamPlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
                {m.matchType !== 'external' && <optgroup label="타팀 지원">{otherPlayers.map(p => <option key={p.id} value={p.id}>({(m.teamAssignments || {})[p.id]}팀) {p.name}</option>)}</optgroup>}
              </select>
            </div>
            <div className="flex items-center gap-3 bg-slate-900 p-3 rounded-xl border border-slate-700">
              <input type="checkbox" name="isPK" defaultChecked={l.isPK} className="w-5 h-5 accent-red-500" />
              <span className="text-sm font-bold text-white">PK 득점 여부</span>
            </div>
            <div><input type="text" name="remark" defaultValue={l.remark || ''} placeholder="특이사항 (선택)" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" /></div>
            <div className="flex gap-2 pt-2 border-t border-slate-700">
              <button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">수정 완료</button>
            </div>
            <button type="button" onClick={() => {
                setSystemConfirm({ isOpen: true, message: '이 득점 기록을 삭제하시겠습니까?', onConfirm: async () => {
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
                    setLogEditModal({ isOpen: false, match: null, log: null });
                  } finally { setIsProcessing(false); }
                } });
            }} className="w-full py-3 mt-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-bold text-sm flex items-center justify-center gap-1"><Trash2 size={16}/> 삭제</button>
          </form>
        </div>
      </div>
    );
  };

  const renderRosterModalForm = () => {
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
            <div className="flex gap-3 pt-4 border-t border-slate-700">
              <button type="button" onClick={() => setRosterModal({isOpen: false, player: null})} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold transition hover:bg-slate-600">취소</button>
              <button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold transition hover:bg-blue-400 shadow-lg">저장하기</button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderAuthModal = () => {
    if (!authModal.isOpen) return null;
    const isTeamLogin = authModal.type === 'teamLogin';
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100]">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
          <h2 className="text-xl font-bold text-white mb-2 text-center">{isTeamLogin ? '팀 입장하기' : '권한 확인'}</h2>
          {isTeamLogin && <p className="text-sm text-slate-400 text-center mb-6">{authModal.targetTeam?.name}의 비밀번호를 입력하세요.</p>}
          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <input type="password" name="password" required placeholder="비밀번호" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none text-center tracking-widest font-mono text-lg" autoFocus />
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setAuthModal({isOpen: false, type: '', targetTeam: null})} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button>
              <button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">확인</button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderCreateTeamModal = () => {
    if (!isCreateTeamOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100]">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
          <h2 className="text-xl font-bold text-white mb-6 text-center">새 팀 생성</h2>
          <form onSubmit={async (e) => {
            e.preventDefault(); if(isProcessing) return; setIsProcessing(true);
            try {
              const newTeamId = 't' + Date.now();
              const newTeam = { id: newTeamId, name: e.target.teamName.value, password: e.target.password.value, adminPassword: e.target.adminPassword.value, logo: newTeamLogo || '⚽' };
              await setDoc(doc(db, 'teams', newTeamId), newTeam);
              setIsCreateTeamOpen(false); setNewTeamLogo(null);
            } finally { setIsProcessing(false); }
          }} className="space-y-4">
            <div className="flex flex-col items-center mb-4">
              <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center text-3xl border border-slate-700 overflow-hidden mb-2 relative group cursor-pointer">
                {newTeamLogo?.startsWith('data:image') ? <img src={newTeamLogo} alt="logo" className="w-full h-full object-cover" /> : newTeamLogo || '⚽'}
                <input type="file" accept="image/*" onChange={async (e) => { if (e.target.files && e.target.files[0]) setNewTeamLogo(await resizeImage(e.target.files[0], 200, 200)); }} className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">팀 이름</label>
              <input type="text" name="teamName" required className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">팀 비밀번호 (일반 팀원용)</label>
              <input type="text" name="password" required className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">팀 관리자 비밀번호 (임원진용)</label>
              <input type="text" name="adminPassword" required className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" />
            </div>
            <div className="flex gap-2 pt-4">
              <button type="button" onClick={() => setIsCreateTeamOpen(false)} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button>
              <button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">생성하기</button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderEditTeamModal = () => {
    if (!editTeamModal.isOpen || !editTeamModal.team) return null;
    const team = editTeamModal.team;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100]">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
          <h2 className="text-xl font-bold text-white mb-6 text-center">팀 정보 수정</h2>
          <form onSubmit={async (e) => {
            e.preventDefault(); if(isProcessing) return; setIsProcessing(true);
            try {
              const updatedTeam = { ...team, name: e.target.teamName.value, password: e.target.password.value, adminPassword: e.target.adminPassword.value, logo: editTeamLogo || team.logo };
              await setDoc(doc(db, 'teams', updatedTeam.id), updatedTeam);
              setEditTeamModal({ isOpen: false, team: null }); setSystemAlert({ isOpen: true, message: '팀 정보가 수정되었습니다.' });
            } finally { setIsProcessing(false); }
          }} className="space-y-4">
            <div className="flex flex-col items-center mb-4">
              <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center text-3xl border border-slate-700 overflow-hidden mb-2 relative group cursor-pointer">
                {(editTeamLogo || team.logo)?.startsWith('data:image') ? <img src={editTeamLogo || team.logo} alt="logo" className="w-full h-full object-cover" /> : editTeamLogo || team.logo}
                <input type="file" accept="image/*" onChange={async (e) => { if (e.target.files && e.target.files[0]) setEditTeamLogo(await resizeImage(e.target.files[0], 200, 200)); }} className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">팀 이름</label>
              <input type="text" name="teamName" required defaultValue={team.name} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">팀 비밀번호</label>
              <input type="text" name="password" required defaultValue={team.password} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">팀 관리자 비밀번호</label>
              <input type="text" name="adminPassword" required defaultValue={team.adminPassword} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" />
            </div>
            <div className="flex gap-2 pt-4">
              <button type="button" onClick={() => setEditTeamModal({isOpen: false, team: null})} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button>
              <button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">수정 완료</button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderAdminPwdChangeModal = () => {
    if (!adminPwdChangeModal) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100]">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
          <h2 className="text-xl font-bold text-white mb-6 text-center">시스템 관리자 마스터 비밀번호 변경</h2>
          <form onSubmit={(e) => { e.preventDefault(); setAdminPassword(e.target.newAdminPwd.value); setAdminPwdChangeModal(false); setSystemAlert({ isOpen: true, message: '마스터 비밀번호가 성공적으로 변경되었습니다.' }); }} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">새 마스터 비밀번호</label>
              <input type="text" name="newAdminPwd" required className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" />
            </div>
            <div className="flex gap-2 pt-4">
              <button type="button" onClick={() => setAdminPwdChangeModal(false)} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button>
              <button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">변경 완료</button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderTeamSettingsModal = () => {
    if (!teamSettingsModal) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100]">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
          <h2 className="text-xl font-bold text-white mb-6 text-center">팀 환경설정</h2>
          <form onSubmit={async (e) => {
            e.preventDefault(); if(isProcessing) return; setIsProcessing(true);
            try {
              const fd = new FormData(e.target);
              const updatedTeam = { ...activeTeam, name: fd.get('name'), password: fd.get('password'), adminPassword: fd.get('teamAdminPassword'), logo: teamSettingsLogo || activeTeam.logo };
              await setDoc(doc(db, 'teams', activeTeamId), updatedTeam);
              setTeamSettingsModal(false); setSystemAlert({isOpen: true, message: '팀 설정이 성공적으로 저장되었습니다.'});
            } finally { setIsProcessing(false); }
          }} className="space-y-4">
            <div className="flex flex-col items-center mb-4">
              <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center text-3xl border border-slate-700 overflow-hidden mb-2 relative group cursor-pointer">
                {(teamSettingsLogo || activeTeam?.logo)?.startsWith('data:image') ? <img src={teamSettingsLogo || activeTeam?.logo} alt="logo" className="w-full h-full object-cover" /> : teamSettingsLogo || activeTeam?.logo}
                <input type="file" accept="image/*" onChange={async (e) => { if (e.target.files && e.target.files[0]) setTeamSettingsLogo(await resizeImage(e.target.files[0], 200, 200)); }} className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">팀 이름</label>
              <input type="text" name="name" required defaultValue={activeTeam?.name} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">일반 팀원 비밀번호</label>
              <input type="text" name="password" required defaultValue={activeTeam?.password} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">팀 관리자 비밀번호</label>
              <input type="text" name="teamAdminPassword" required defaultValue={activeTeam?.adminPassword} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" />
            </div>
            <div className="flex gap-2 pt-4 border-t border-slate-700">
              <button type="button" onClick={() => setTeamSettingsModal(false)} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button>
              <button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">저장하기</button>
            </div>
            
            <div className="mt-4 pt-4 border-t border-red-500/30">
              <button type="button" onClick={() => {
                 setSystemConfirm({ isOpen: true, message: '과거 토너먼트의 동점자 승점 오류를\n모두 자동 복구하시겠습니까?\n(오직 득점 정보만 재계산됩니다)', onConfirm: async () => {
                   if(isProcessing) return; setIsProcessing(true);
                   try {
                     const tourMatches = currentTeamMatches.filter(m => m.isTournament && m.status === 'completed');
                     const updatePromises = tourMatches.map(m => {
                         let fixedQuarterScores = [...(m.quarterScores || [])];
                         const scoresMap = {}; TEAM_LETTERS.forEach(t => scoresMap[t] = 0);
                         fixedQuarterScores.forEach(qs => {
                             const qLogs = (m.logs || []).filter(l => l.quarter === qs.quarter);
                             const score1 = qLogs.filter(l => l.teamLetter === qs.team1).length;
                             const score2 = qLogs.filter(l => l.teamLetter === qs.team2).length;
                             qs.score1 = score1; qs.score2 = score2;
                             scoresMap[qs.team1] += score1; scoresMap[qs.team2] += score2;
                         });
                         return setDoc(doc(db, 'matches', m.id), { ...m, quarterScores: fixedQuarterScores, scores: scoresMap });
                     });
                     await Promise.all(updatePromises);
                     setSystemAlert({isOpen: true, message: '복구가 완료되었습니다.\n순위표가 정상적으로 계산됩니다.'});
                   } finally { setIsProcessing(false); }
                 }});
              }} className="w-full py-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-bold text-sm flex items-center justify-center gap-1"><RotateCcw size={16}/> 과거 토너먼트 점수 오류 일괄 복구</button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderTokenEditModal = () => {
    if (!tokenEditModal.isOpen || !tokenEditModal.token) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100] animate-in fade-in">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2"><Target size={18}/> 토큰 정보 수정</h2>
            <button onClick={() => setTokenEditModal({isOpen: false, token: null})} className="text-slate-400 hover:text-white"><X size={20}/></button>
          </div>
          <form onSubmit={(e) => {
            e.preventDefault(); const fd = new FormData(e.target); const pos = fd.get('position'); const name = fd.get('name');
            const newTokens = tacticTokens.map(t => t.id === tokenEditModal.token.id ? { ...t, position: pos, name: name } : t);
            saveHistory(newTokens); setTokenEditModal({ isOpen: false, token: null });
          }} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">포지션 약어</label>
              <input type="text" name="position" defaultValue={tokenEditModal.token.position || ''} maxLength="3" placeholder="예: FW, CM" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none text-center font-black tracking-wider uppercase" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">선수 이름표 (선택)</label>
              <input type="text" name="name" defaultValue={tokenEditModal.token.name || ''} placeholder="예: 손흥민" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none text-center font-bold" />
            </div>
            <div className="flex gap-2 pt-2 border-t border-slate-700">
              <button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">수정 완료</button>
            </div>
            <button type="button" onClick={() => {
                const newTokens = tacticTokens.filter(t => t.id !== tokenEditModal.token.id);
                saveHistory(newTokens); setTokenEditModal({ isOpen: false, token: null });
            }} className="w-full py-3 mt-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-bold text-sm flex items-center justify-center gap-1"><Trash2 size={16}/> 이 선수 토큰 삭제</button>
          </form>
        </div>
      </div>
    );
  };

  const renderShareModal = () => {
    if (!shareModal.isOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[200] p-4 animate-in fade-in">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl text-center flex flex-col items-center">
          {shareModal.step === 1 ? (
            <>
              <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div>
              <h2 className="text-lg font-bold text-white mb-2">공유용 파일 생성 중...</h2>
              <p className="text-xs text-slate-400">잠시만 기다려 주세요.</p>
            </>
          ) : (
            <>
              <div className="w-full bg-slate-900 rounded-2xl p-2 mb-6 border border-slate-700 h-64 overflow-y-auto overscroll-contain flex flex-col items-start relative shadow-inner">
                {shareModal.isVideo ? (
                  <video src={shareModal.imgUrl} controls autoPlay loop className="w-full h-auto rounded-xl shadow-lg border border-slate-700" />
                ) : (
                  <img src={shareModal.imgUrl} alt="preview" className="w-full h-auto rounded-xl shadow-lg border border-slate-700" />
                )}
              </div>
              <h2 className="text-lg font-bold text-white mb-6 w-full flex items-center justify-center gap-2">
                <CheckCircle className="text-green-400"/> 파일 생성 완료!
              </h2>
              <div className="flex w-full gap-3">
                <button onClick={() => setShareModal({ isOpen: false, step: 1, data: null, file: null, imgUrl: null, isVideo: false })} className="flex-1 py-3.5 bg-slate-700 text-white rounded-xl font-bold hover:bg-slate-600 transition">닫기</button>
                <button onClick={doActualShare} className="flex-1 py-3.5 bg-blue-500 text-white rounded-xl font-bold hover:bg-blue-400 transition shadow-lg flex items-center justify-center gap-2"><Share2 size={18}/> 공유하기</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  if (appState === 'login') {
    return (
      <div className="min-h-[100dvh] bg-slate-900 text-slate-200 font-sans p-6 flex flex-col justify-center max-w-md mx-auto relative" style={{ paddingBottom: 'env(safe-area-inset-bottom)', paddingTop: 'env(safe-area-inset-top)' }}>
        {globalStyles}
        <div className="absolute top-6 right-6" style={{ top: 'calc(env(safe-area-inset-top) + 1.5rem)' }}>
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
              <div className="w-16 h-16 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl flex items-center justify-center shadow-lg relative z-10"><Activity size={32} className="text-blue-500" /></div>
            </div>
          </div>
          <h1 className="text-4xl font-black tracking-tighter mb-3 bg-gradient-to-r from-white via-blue-100 to-slate-400 text-transparent bg-clip-text">MATCHBOARD</h1>
          <p className="text-slate-400 text-sm font-medium tracking-wide">승리를 기록하는 가장 스마트한 방법</p>
          {isLoginAdminMode && <div className="mt-5 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs py-2 px-4 rounded-xl font-bold inline-block animate-pulse">시스템 관리자 모드 활성화됨</div>}
        </div>
        <div className="space-y-4 mb-8">
          <h2 className="text-sm font-bold text-slate-500 px-2">{isLoginAdminMode ? '등록된 팀 관리' : '내 팀 선택하기'}</h2>
          {!isLoaded ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div></div>
          ) : teams.length === 0 && !isLoginAdminMode ? (
            <div className="text-center py-10 bg-slate-800/50 rounded-2xl border border-slate-700 text-sm text-slate-500 animate-in fade-in">등록된 팀이 없습니다.<br/>우측 상단의 <strong className="text-slate-400">관리자 설정</strong>에서<br/>새로운 팀을 생성해 주세요.</div>
          ) : (
            <div className="space-y-4 animate-in fade-in">
              {teams.map(team => (
                <div key={team.id} className="relative group">
                  <button onClick={() => !isLoginAdminMode && setAuthModal({ isOpen: true, type: 'teamLogin', targetTeam: team })} className={`w-full bg-slate-800 hover:bg-slate-700 p-4 rounded-2xl border border-slate-700 flex items-center gap-4 transition text-left ${isLoginAdminMode ? 'cursor-default' : 'cursor-pointer'}`}>
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
            <button onClick={() => { setNewTeamLogo(null); setIsCreateTeamOpen(true); }} className="w-full py-4 border-2 border-dashed border-slate-700 rounded-2xl text-blue-400 font-bold flex items-center justify-center gap-2 hover:border-blue-500 bg-blue-500/5 transition"><Plus size={20} /> 새 팀 생성하기</button>
            <button onClick={() => setAdminPwdChangeModal(true)} className="w-full py-4 border-2 border-dashed border-slate-700 rounded-2xl text-slate-400 font-bold flex items-center justify-center gap-2 hover:text-white hover:border-slate-500 bg-slate-800/50 transition"><Shield size={20} /> 관리자 마스터 비밀번호 변경</button>
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
        <button onClick={() => setAppState('main')} className="flex items-center gap-1 text-slate-400 hover:text-white font-bold text-sm"><ChevronLeft size={20}/> 메인</button>
        <h2 className="text-lg font-black text-white">{title}</h2>
        <div className="flex items-center gap-2">
          {!isExternal && <button onClick={() => setAssignmentModal({isOpen: true, match: liveMatch})} className="text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg font-bold border border-slate-600 flex items-center gap-1 hover:bg-slate-700 transition"><Users size={14}/> 편성</button>}
          <button onClick={() => triggerShare(liveMatch)} className="text-xs bg-yellow-500/20 text-yellow-500 px-3 py-1.5 rounded-lg font-bold border border-yellow-500/30 flex items-center gap-1 hover:bg-yellow-500/30 transition"><Share2 size={14}/> 공유</button>
        </div>
      </header>
    );

    if (!liveState.isQuarterActive) {
      const maxTeams = getMatchTeamCount(liveMatch);
      const { title: tmtTitle } = getTournamentQuarterInfo(liveState.currentQuarter);
      const prevQuarterNum = liveState.currentQuarter - 1;
      
      return (
        <div className="bg-slate-900 text-slate-200 font-sans p-5 sm:p-6 max-w-md mx-auto flex flex-col relative min-h-[100dvh] overflow-hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)', paddingTop: 'env(safe-area-inset-top)' }}>
          {globalStyles}
          {renderLiveHeader("새 쿼터 준비")}
          <div className="flex-1 flex flex-col justify-center pb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {liveMatch.isTournament && <div className="text-center text-yellow-400 font-bold mb-2 text-sm">{tmtTitle} 대진표 자동 배정됨</div>}
            <h2 className="text-3xl font-black text-center text-white mb-2">{liveState.currentQuarter}Q 매치업</h2>
            <p className="text-center text-slate-400 mb-10">이번 쿼터에 맞붙을 팀을 확인하세요.</p>
            
            {isExternal ? (
              <div className="flex items-center justify-center gap-4 mb-12">
                <div className="w-32 border-2 text-white font-black text-xl text-center py-8 rounded-2xl shadow-xl bg-slate-800 border-slate-400">{activeTeam?.name || '우리 팀'}</div>
                <span className="text-slate-600 font-black italic text-2xl">VS</span>
                <div className={`w-32 border-2 text-white font-black text-xl text-center py-8 rounded-2xl shadow-xl ${TEAM_COLORS['B']}`}>{liveMatch.opponentName}</div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-4 mb-12">
                <select value={liveState.playingTeams[0]} onChange={(e) => setLiveState({...liveState, playingTeams: [e.target.value, liveState.playingTeams[1]]})} className={`w-28 border-2 text-white font-black text-3xl text-center py-6 rounded-2xl appearance-none shadow-xl outline-none ${liveState.playingTeams[0] === 'A' ? 'bg-slate-800 border-slate-400' : TEAM_COLORS[liveState.playingTeams[0]]}`}>
                  {TEAM_LETTERS.slice(0, maxTeams).map(t => <option key={t} value={t} className="bg-slate-900">{t}팀</option>)}
                </select>
                <span className="text-slate-600 font-black italic text-2xl">VS</span>
                <select value={liveState.playingTeams[1]} onChange={(e) => setLiveState({...liveState, playingTeams: [liveState.playingTeams[0], e.target.value]})} className={`w-28 border-2 text-white font-black text-3xl text-center py-6 rounded-2xl appearance-none shadow-xl outline-none ${liveState.playingTeams[1] === 'A' ? 'bg-slate-800 border-slate-400' : TEAM_COLORS[liveState.playingTeams[1]]}`}>
                  {TEAM_LETTERS.slice(0, maxTeams).map(t => <option key={t} value={t} className="bg-slate-900">{t}팀</option>)}
                </select>
              </div>
            )}
            
            <button onClick={() => {
              if (liveState.playingTeams[0] === liveState.playingTeams[1]) { setSystemAlert({isOpen:true, message:'서로 다른 팀을 선택해주세요.'}); return; }
              setLiveState({...liveState, isQuarterActive: true});
            }} className="w-full bg-blue-500 hover:bg-blue-400 text-white font-black py-4 rounded-xl text-xl shadow-lg transition">쿼터 시작하기</button>
            <button onClick={() => endQuarter(true)} className="w-full bg-slate-800 text-slate-400 hover:text-white font-bold py-3 rounded-xl mt-3 text-sm transition border border-slate-700">경기 조기 종료</button>
          </div>
          
          <div className="bg-slate-800/50 p-4 rounded-t-3xl border-t border-slate-700/50 -mx-5 -mb-5 sm:-mx-6 sm:-mb-6 mt-auto">
             <h3 className="text-[11px] font-bold text-slate-400 mb-3 ml-2 flex items-center gap-1.5"><Activity size={12}/> {prevQuarterNum > 0 ? '이전 쿼터 결과' : '첫 쿼터 준비 중'}</h3>
             <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2 px-2">
                {(liveMatch.quarterScores || []).map(qs => (
                  <div key={qs.quarter} className="flex-shrink-0 bg-slate-900 border border-slate-700 rounded-xl p-3 flex flex-col items-center justify-center min-w-[140px]">
                    <div className="text-[10px] font-black text-slate-500 mb-2 bg-slate-800 px-2.5 py-0.5 rounded-full">{qs.quarter}Q</div>
                    <div className="flex items-center justify-between w-full gap-2">
                      <div className="flex flex-col items-center w-0 flex-1">
                        <span className={`text-[10px] font-bold whitespace-nowrap mb-0.5 ${TEAM_TEXT_COLORS[qs.team1]}`}>{getTeamDisplayName(liveMatch, qs.team1)}</span>
                        <span className="text-white font-black text-xl leading-none">{qs.score1}</span>
                      </div>
                      <div className="text-slate-600 font-black text-xs pb-1 shrink-0">:</div>
                      <div className="flex flex-col items-center w-0 flex-1">
                        <span className={`text-[10px] font-bold whitespace-nowrap mb-0.5 ${TEAM_TEXT_COLORS[qs.team2]}`}>{getTeamDisplayName(liveMatch, qs.team2)}</span>
                        <span className="text-white font-black text-xl leading-none">{qs.score2}</span>
                      </div>
                    </div>
                  </div>
                )).reverse()}
             </div>
          </div>

          {renderAssignmentModal()}
          {renderShareModal()}
          {renderHiddenCaptureArea()}
          {renderSystemModals()}
        </div>
      );
    }

    const t1Letter = activeTeams[0]; const t2Letter = activeTeams[1];
    const currentQLogs = (liveMatch.logs || []).filter(l => l.quarter === liveState.currentQuarter);
    const t1QScore = currentQLogs.filter(l => l.teamLetter === t1Letter).length;
    const t2QScore = currentQLogs.filter(l => l.teamLetter === t2Letter).length;
    
    return (
      <div className="bg-slate-900 text-slate-200 font-sans p-5 sm:p-6 max-w-md mx-auto relative flex flex-col min-h-[100dvh] overflow-hidden animate-in fade-in" style={{ paddingBottom: 'env(safe-area-inset-bottom)', paddingTop: 'env(safe-area-inset-top)' }}>
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
          <button onClick={() => setGoalFlow({ isOpen: true, step: 1, matchId: null, quarter: null, teamLetter: t1Letter, scorer: null, isPK: false, remark: '', isMissingAdd: false })} className={`flex-1 border-2 py-6 rounded-3xl flex flex-col items-center justify-center gap-2 transition shadow-lg ${t1Letter === 'A' ? 'bg-slate-800 border-slate-400 text-white' : TEAM_COLORS[t1Letter]}`}>
            <Trophy size={28} className="fill-current"/>
            <span className="font-black text-sm">{getTeamDisplayName(liveMatch, t1Letter)} 득점</span>
          </button>
          <button onClick={() => setGoalFlow({ isOpen: true, step: 1, matchId: null, quarter: null, teamLetter: t2Letter, scorer: null, isPK: false, remark: '', isMissingAdd: false })} className={`flex-1 border-2 py-6 rounded-3xl flex flex-col items-center justify-center gap-2 transition shadow-lg ${t2Letter === 'A' ? 'bg-slate-800 border-slate-400 text-white' : TEAM_COLORS[t2Letter]}`}>
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
                 <span className="font-bold text-white text-[15px] flex items-center">
                   <span className={TEAM_TEXT_COLORS[qs.team1]}>{getTeamDisplayName(liveMatch, qs.team1)}</span>
                   <span className="text-slate-500 mx-3">{qs.score1} : {qs.score2}</span> 
                   <span className={TEAM_TEXT_COLORS[qs.team2]}>{getTeamDisplayName(liveMatch, qs.team2)}</span>
                 </span>
                 <button onClick={() => setQuarterEditModal({isOpen: true, match: liveMatch, quarterScore: qs})} className="absolute right-0 text-slate-500 hover:text-white p-1 bg-slate-800 rounded-md transition"><Edit size={14}/></button>
               </div>
               {renderQuarterLogsBlock(liveMatch, qs, true)}
               <div className="flex justify-center mt-4 pt-3 border-t border-slate-800/50">
                 <button onClick={() => setGoalFlow({ isOpen: true, step: 1, matchId: liveMatch.id, quarter: qs.quarter, teamLetter: qs.team1, availableTeams: [qs.team1, qs.team2], scorer: null, isPK: false, remark: '', isMissingAdd: true })} className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 px-3 py-1.5 rounded-lg flex items-center gap-1 transition"><Plus size={14}/> 누락된 득점 추가</button>
               </div>
            </div>
          ))}

          <div className="bg-slate-900 rounded-2xl p-4 border border-blue-500/30 shadow-lg relative overflow-hidden shrink-0">
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-transparent"></div>
             <div className="relative flex justify-center items-center border-b border-slate-800 pb-3 mb-4">
               <span className="absolute left-0 font-black text-blue-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> {liveState.currentQuarter}Q</span>
               <span className="font-bold text-white text-[15px]">
                   <span className={TEAM_TEXT_COLORS[t1Letter]}>{getTeamDisplayName(liveMatch, t1Letter)}</span>
                   <span className="text-slate-500 mx-3">{t1QScore} : {t2QScore}</span> 
                   <span className={TEAM_TEXT_COLORS[t2Letter]}>{getTeamDisplayName(liveMatch, t2Letter)}</span>
               </span>
             </div>
             {renderQuarterLogsBlock(liveMatch, { quarter: liveState.currentQuarter, team1: t1Letter }, true)}
          </div>
          <div className="h-6 shrink-0 w-full"></div>
        </div>
        
        {renderAssignmentModal()}
        {renderShareModal()}
        {renderHiddenCaptureArea()}
        {renderGoalFlowModal()}
        {renderLogEditModal()}
        {renderQuarterEditModal()}
        {renderSystemModals()}
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-900 text-slate-200 font-sans pb-24 max-w-md mx-auto relative shadow-xl flex flex-col" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 6rem)' }}>
      {globalStyles}
      <header className="px-6 py-4 border-b border-slate-800 bg-slate-900 sticky top-0 z-[60] flex justify-between items-center shrink-0" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center border border-slate-700 text-lg overflow-hidden shrink-0">
            {activeTeam?.logo?.startsWith('data:image') ? <img src={activeTeam?.logo} alt="logo" className="w-full h-full object-cover" /> : activeTeam?.logo}
          </div>
          <div>
            <h1 className="text-lg font-black text-white italic tracking-tight">MATCHBOARD</h1>
            <div className="text-[10px] text-slate-500 flex items-center gap-2">
              <span className={isAdmin ? "text-blue-400 font-bold" : ""}>{activeTeam?.name} {isAdmin ? '(관리자)' : '(조회모드)'}</span>
              {isAdmin && <button onClick={() => { setTeamSettingsLogo(activeTeam?.logo); setTeamSettingsModal(true); }} className="text-slate-400 hover:text-white transition"><Settings size={12}/></button>}
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
        {activeTab === 'matches' && (
          <div className="space-y-6 animate-in fade-in flex-1 overflow-y-auto hide-scrollbar">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-black text-white">팀 경기</h2>
              {isAdmin && (
                <button onClick={() => openMatchModal(null)} className="bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 shadow-lg hover:bg-blue-600 transition"><Plus size={16}/> 새 경기</button>
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
                    {checkCanEdit(m) && (
                      <div className="absolute top-3 right-3 flex gap-2">
                        <button onClick={() => openMatchModal(m)} className="text-slate-400 hover:text-white p-1"><Edit size={16}/></button>
                        {isAdmin && <button onClick={() => requestDeleteMatch(m.id)} className="text-slate-400 hover:text-red-400 p-1"><Trash2 size={16}/></button>}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-blue-400 font-bold mb-2"><span className="bg-blue-500/20 px-2 py-0.5 rounded text-[10px]">예정</span> {m.date} {formatTimeAmPm(m.time)}</div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${m.matchType === 'external' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : m.matchType === 'futsal' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'}`}>
                        {m.matchType === 'external' ? '교류전' : m.matchType === 'futsal' ? '풋살' : '자체전'}
                      </span>
                      {m.isTournament && <span className="text-[10px] font-bold bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded border border-yellow-500/30">토너먼트</span>}
                      <div className="text-lg font-bold text-white">{m.location}</div>
                    </div>
                    <div className="text-xs text-slate-400 mb-4 mt-1">{m.matchType === 'external' ? `우리 팀 VS ${m.opponentName}` : `총 ${m.teamCount || 2}팀 파전`} • 총 {m.totalQuarters}쿼터 • 참석 {(m.attendees || []).length}명</div>
                    <div className="flex gap-2">
                      {m.matchType !== 'external' && <button onClick={() => handleActionClick('assign', m)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl text-sm flex justify-center items-center gap-2 transition"><Users size={16}/> 편성</button>}
                      <button onClick={() => handleActionClick('start', m)} className={`bg-blue-500 text-white font-bold py-3 rounded-xl text-sm flex justify-center items-center gap-2 shadow-lg hover:bg-blue-600 transition ${m.matchType === 'external' ? 'w-full' : 'flex-1'}`}>
                        {(m.logs || []).length > 0 ? <Activity size={16}/> : <Play size={16} className="fill-current"/>} {(m.logs || []).length > 0 ? '이어하기' : '기록 시작'}
                      </button>
                    </div>
                  </div>
                ))}
                {completedThisMonthWithStandings.map(m => (
                  <div key={m.id} onClick={() => { setDetailModalMatchId(m.id); setDetailModal({isOpen: true, match: m}); }} className="bg-slate-900 p-5 rounded-2xl border border-slate-700 opacity-80 hover:opacity-100 hover:border-slate-500 cursor-pointer transition relative group">
                    <div className="absolute top-3 right-3 flex gap-2 items-center">
                      <button onClick={(e) => { e.stopPropagation(); triggerShare(m); }} className="text-yellow-500 hover:text-yellow-400 p-1 bg-slate-800 rounded-md ml-1"><Share2 size={14}/></button>
                      {isAdmin && <button onClick={(e) => { e.stopPropagation(); requestDeleteMatch(m.id); }} className="text-slate-500 hover:text-red-400 p-1 bg-slate-800 rounded-md ml-1"><Trash2 size={14}/></button>}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-400 font-bold mb-2"><CheckCircle size={14}/> {m.date} (종료)</div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${m.matchType === 'external' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : m.matchType === 'futsal' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'}`}>
                        {m.matchType === 'external' ? '교류전' : m.matchType === 'futsal' ? '풋살' : '자체전'}
                      </span>
                      {m.isTournament && <span className="text-[10px] font-bold bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded border border-yellow-500/30">토너먼트</span>}
                      <div className="text-base font-bold text-slate-300">{m.location}</div>
                    </div>
                    <div className="bg-slate-800 rounded-xl p-3 mb-3 border border-slate-700/50">
                      <div className="text-xs text-slate-400 mb-2 font-bold border-b border-slate-700 pb-2 flex justify-between"><span>순위표</span><span className="text-blue-400 font-normal">상세보기 &gt;</span></div>
                      {renderStandingsTableBlock(m)}
                    </div>
                    <div className="mb-3">
                      <div className="flex justify-between items-center text-xs text-slate-400 mb-2 font-bold px-1"><span>쿼터별 스코어 보드</span></div>
                      <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2 cursor-grab active:cursor-grabbing" onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; }}>
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
                ))}
              </div>
            )}
          </div>
        )}

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
                    {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => <div key={d} className={`text-[10px] font-bold ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-500'}`}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {(() => {
                    const year = viewDate.getFullYear(); const month = viewDate.getMonth(); const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const days = [];
                    for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="p-2" />);
                    for (let day = 1; day <= daysInMonth; day++) {
                      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const dayMatches = matchesByDate[dateStr] || [];
                      days.push(
                        <div key={day} className="p-2 aspect-square border border-slate-700/50 rounded-xl relative flex flex-col items-center bg-slate-800/30">
                          <span className="text-xs font-bold text-slate-300">{day}</span>
                          <div className="flex gap-1 mt-1">{dayMatches.map((m, idx) => <div key={idx} className={`w-1.5 h-1.5 rounded-full ${m.status === 'completed' ? 'bg-slate-500' : 'bg-blue-400'}`} />)}</div>
                        </div>
                      );
                    }
                    return days;
                  })()}
                </div>
            </div>

            <div className="mt-6 space-y-3">
                <h3 className="text-sm font-bold text-slate-400 px-1 border-b border-slate-800 pb-2">이달의 일정 목록</h3>
                {monthlyMatches.length === 0 ? (
                    <div className="text-center py-6 text-slate-600 text-sm">일정이 없습니다.</div>
                ) : (
                    monthlyMatches.sort((a,b) => a.date.localeCompare(b.date)).map(m => (
                        <div key={m.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex items-center gap-3 relative group">
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
                                    {formatTimeAmPm(m.time)} • {m.matchType === 'external' ? `vs ${m.opponentName}` : m.matchType === 'futsal' ? `${m.teamCount || 2}팀 풋살` : `${m.teamCount || 2}팀 자체전`}
                               </div>
                           </div>

                           <div className="flex items-center gap-2 shrink-0">
                               {(m.photos || []).length > 0 && (
                               <div className="w-10 h-10 rounded-lg overflow-hidden relative cursor-pointer shadow-sm border border-slate-600" onClick={(e) => { e.stopPropagation(); setGalleryModal({ isOpen: true, photos: m.photos, currentIndex: 0, matchId: m.id }); }}>
                                  <img src={m.photos[0].url} alt="thumb" className="w-full h-full object-cover" />
                                  {m.photos.length > 1 && <div className="absolute bottom-0 right-0 bg-black/70 text-[9px] font-black text-white px-1 leading-tight">+{m.photos.length - 1}</div>}
                               </div>
                               )}
                               <label className="text-slate-400 hover:text-white p-2 cursor-pointer bg-slate-700 rounded-lg border border-slate-600 transition" onClick={e => e.stopPropagation()}>
                                  <Plus size={16}/>
                                  <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleUploadPhotos(e, m.id)} />
                               </label>
                           </div>
                        </div>
                    ))
                )}
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="space-y-6 animate-in fade-in flex-1 overflow-y-auto hide-scrollbar">
            <h2 className="text-xl font-black text-white">팀 통계</h2>
            <div className="flex bg-slate-900 rounded-xl p-1 shrink-0">
               <button type="button" onClick={() => setStatsPeriod('month')} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition ${statsPeriod === 'month' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-400'}`}>월간 통계</button>
               <button type="button" onClick={() => setStatsPeriod('year')} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition ${statsPeriod === 'year' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-400'}`}>연간 통계</button>
            </div>
            <div className="flex bg-slate-900 rounded-xl p-1 mb-4 shrink-0 overflow-x-auto hide-scrollbar">
               <button type="button" onClick={() => setStatsType('total')} className={`flex-1 py-2 px-3 rounded-lg text-[11px] font-bold transition whitespace-nowrap ${statsType === 'total' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-400'}`}>통합 (자체+교류)</button>
               <button type="button" onClick={() => setStatsType('internal')} className={`flex-1 py-2 px-3 rounded-lg text-[11px] font-bold transition whitespace-nowrap ${statsType === 'internal' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-400'}`}>자체전</button>
               <button type="button" onClick={() => setStatsType('external')} className={`flex-1 py-2 px-3 rounded-lg text-[11px] font-bold transition whitespace-nowrap ${statsType === 'external' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-400'}`}>교류전</button>
               <button type="button" onClick={() => setStatsType('futsal')} className={`flex-1 py-2 px-3 rounded-lg text-[11px] font-bold transition whitespace-nowrap ${statsType === 'futsal' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-400'}`}>풋살</button>
            </div>
            <div className="flex justify-between items-center bg-slate-800 p-3 rounded-2xl border border-slate-700">
              <button onClick={statsPeriod === 'month' ? prevMonth : prevYear} className="p-2 text-slate-400 hover:text-white"><ChevronLeft size={20}/></button>
              <h3 className="text-lg font-black text-white">{statsPeriod === 'month' ? `${viewDate.getFullYear()}년 ${viewDate.getMonth() + 1}월` : `${viewDate.getFullYear()}년`}</h3>
              <button onClick={statsPeriod === 'month' ? nextMonth : nextYear} className="p-2 text-slate-400 hover:text-white"><ChevronRight size={20}/></button>
            </div>
            {filteredStats.filter(s => s.caps > 0).length === 0 ? (
              <div className="text-center py-10 text-slate-500 border border-slate-800 rounded-2xl text-sm">해당 기간에 종료된 경기 데이터가 없습니다.</div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 flex flex-col items-center text-center shadow-sm overflow-hidden">
                    <span className="text-xs font-black text-slate-300 mb-2">{titlePrefix} 득점왕</span><span className="text-2xl mb-1">⚽</span>
                    <span className="text-[13px] font-black text-white leading-tight mb-0.5" style={{wordBreak: 'keep-all'}}>{topScorers.length===0?'없음':topScorers.length===1?topScorers[0].name:`${topScorers[0].name} 외 ${topScorers.length-1}명`}</span><span className="text-xs font-bold text-blue-400">{maxGoals > 0 ? `${maxGoals}골` : ''}</span>
                  </div>
                  <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 flex flex-col items-center text-center shadow-sm overflow-hidden">
                    <span className="text-xs font-black text-slate-300 mb-2">{titlePrefix} 도움왕</span><span className="text-2xl mb-1">👟</span>
                    <span className="text-[13px] font-black text-white leading-tight mb-0.5" style={{wordBreak: 'keep-all'}}>{topAssists.length===0?'없음':topAssists.length===1?topAssists[0].name:`${topAssists[0].name} 외 ${topAssists.length-1}명`}</span><span className="text-xs font-bold text-blue-400">{maxAssists > 0 ? `${maxAssists}도움` : ''}</span>
                  </div>
                  <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 flex flex-col items-center text-center shadow-sm overflow-hidden">
                    <span className="text-xs font-black text-slate-300 mb-2">{titlePrefix} 참석왕</span><span className="text-2xl mb-1">🔥</span>
                    <span className="text-[13px] font-black text-white leading-tight mb-0.5" style={{wordBreak: 'keep-all'}}>{topCaps.length===0?'없음':topCaps.length===1?topCaps[0].name:`${topCaps[0].name} 외 ${topCaps.length-1}명`}</span><span className="text-xs font-bold text-blue-400">{maxCaps > 0 ? `${maxCaps}회` : ''}</span>
                  </div>
                </div>
                <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 shadow-sm">
                  <table className="w-full text-sm text-center">
                    <thead>
                      <tr className="text-slate-500 font-bold border-b border-slate-700">
                        <th className="pb-3 text-left pl-2">선수명</th><th className="pb-3">참석</th><th className="pb-3">득점</th><th className="pb-3">도움</th><th className="pb-3">포인트</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStats.filter(s => s.caps > 0).map(st => (
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
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'tactics' && (
          <div className="animate-in fade-in flex-1 flex flex-col min-h-0 relative pb-2 -mx-2 px-2">
            <div className="flex justify-between items-center shrink-0 mb-3">
              <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-lg border border-slate-700">
                 <button onClick={() => { setPitchType('full'); saveHistory(getInitialTacticsTokens('full'), []); setAnimationFrames([]); setIsPlaying(false); setIsAutoRecording(false); if (playbackRef.current) cancelAnimationFrame(playbackRef.current); }} className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition ${pitchType === 'full' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>풀 코트</button>
                 <button onClick={() => { setPitchType('half'); saveHistory(getInitialTacticsTokens('half'), []); setAnimationFrames([]); setIsPlaying(false); setIsAutoRecording(false); if (playbackRef.current) cancelAnimationFrame(playbackRef.current); }} className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition ${pitchType === 'half' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>하프</button>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => {if(pastState.length > 0) { const prev = pastState[pastState.length - 1]; setPastState(p => p.slice(0, -1)); setFutureState(p => [{ tokens: tacticTokens, drawings }, ...p]); setTacticTokens(prev.tokens); setDrawings(prev.drawings); }}} disabled={pastState.length === 0 || isPlaying} className="p-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg disabled:opacity-30 hover:bg-slate-700 transition"><Undo size={14}/></button>
                <button onClick={() => {if(futureState.length > 0) { const next = futureState[0]; setFutureState(p => p.slice(1)); setPastState(p => [...p, { tokens: tacticTokens, drawings }]); setTacticTokens(next.tokens); setDrawings(next.drawings); }}} disabled={futureState.length === 0 || isPlaying} className="p-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg disabled:opacity-30 hover:bg-slate-700 transition"><Redo size={14}/></button>
                <button onClick={() => { setPitchType(pitchType); saveHistory(getInitialTacticsTokens(pitchType), []); setAnimationFrames([]); setIsPlaying(false); setIsAutoRecording(false); if (playbackRef.current) cancelAnimationFrame(playbackRef.current); }} className="px-2.5 py-1.5 bg-slate-800 text-slate-400 rounded-lg font-bold text-[11px] border border-slate-700 hover:bg-slate-700 transition">초기화</button>
                <button onClick={triggerTacticShare} className="px-2.5 py-1.5 bg-yellow-500/20 text-yellow-500 rounded-lg font-bold text-[11px] border border-yellow-500/30 hover:bg-yellow-500/30 transition flex items-center gap-1"><Share2 size={12}/> 캡처</button>
              </div>
            </div>

            <div className="flex justify-between items-center bg-slate-900 rounded-2xl p-1 border border-slate-700 shrink-0 mb-1 gap-1">
               <button onClick={() => setCurrentTool('move')} className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition ${currentTool === 'move' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800'}`}><MousePointer size={15}/><span className="text-[11px] font-bold">이동</span></button>
               <button onClick={() => setCurrentTool('arrow')} className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition ${currentTool === 'arrow' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800'}`}><ArrowUpRight size={15}/><span className="text-[11px] font-bold">화살표</span></button>
               <button onClick={() => setCurrentTool('pass')} className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition ${currentTool === 'pass' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800'}`}><TrendingUp size={15}/><span className="text-[11px] font-bold">패스</span></button>
               <button onClick={() => setCurrentTool('zone')} className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition ${currentTool === 'zone' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800'}`}><Square size={15}/><span className="text-[11px] font-bold">지역</span></button>
               <button onClick={() => setCurrentTool('erase')} className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition ${currentTool === 'erase' ? 'bg-red-500 text-white shadow' : 'text-slate-400 hover:bg-slate-800'}`}><XCircle size={15}/><span className="text-[11px] font-bold">지우기</span></button>
            </div>

            <div className="flex-1 w-full flex justify-center items-center min-h-0 relative pb-6 mt-1">
              <div 
                ref={boardRef}
                style={{ maxHeight: '100%', maxWidth: '100%', aspectRatio: pitchType === 'full' ? '2/3' : '4/3', touchAction: 'none' }}
                onPointerDown={handleBoardPointerDown} onPointerMove={handleBoardPointerMove} onPointerUp={handleBoardPointerUp} onPointerLeave={handleBoardPointerUp}
                className={`relative bg-emerald-700 border-2 ${isAutoRecording ? 'border-red-500 shadow-[inset_0_0_20px_rgba(239,68,68,0.7)]' : isPlaying ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.6)]' : 'border-white/80 shadow-inner'} overflow-hidden tactic-board select-none w-full mx-auto transition-colors duration-300`}
              >
                {pitchType === 'full' && (
                  <>
                    <div className="absolute top-1/2 left-0 w-full border-t-2 border-white/60 pointer-events-none"></div>
                    <div className="absolute top-1/2 left-1/2 w-20 h-20 sm:w-28 sm:h-28 border-2 border-white/60 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
                    <div className="absolute top-0 left-1/2 w-3/5 h-[15%] border-2 border-t-0 border-white/60 -translate-x-1/2 pointer-events-none"></div>
                    <div className="absolute bottom-0 left-1/2 w-3/5 h-[15%] border-2 border-b-0 border-white/60 -translate-x-1/2 pointer-events-none"></div>
                  </>
                )}
                {pitchType === 'half' && (
                  <>
                    <div className="absolute top-0 left-0 w-full border-t-2 border-white/60 pointer-events-none"></div>
                    <div className="absolute top-0 left-1/2 w-32 h-32 border-2 border-white/60 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
                    <div className="absolute bottom-0 left-1/2 w-[70%] h-[40%] border-2 border-b-0 border-white/60 -translate-x-1/2 pointer-events-none"></div>
                  </>
                )}

                <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                  <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#FACC15" /></marker>
                    <marker id="passhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#60A5FA" /></marker>
                  </defs>
                  <line ref={svgArrowRef} stroke="#FACC15" strokeWidth="4" markerEnd="url(#arrowhead)" style={{display: 'none'}} />
                  <line ref={svgPassRef} stroke="#60A5FA" strokeWidth="4" strokeDasharray="8,8" markerEnd="url(#passhead)" style={{display: 'none'}} />
                  <rect ref={svgZoneRef} fill="rgba(59, 130, 246, 0.3)" stroke="#3B82F6" strokeWidth="3" style={{display: 'none'}} />
                  {drawings.filter(Boolean).map(d => {
                    const isEraseMode = currentTool === 'erase' && !isPlaying;
                    const pClass = isEraseMode ? 'pointer-events-auto cursor-pointer hover:stroke-red-500 hover:stroke-[5px]' : '';
                    if (d.type === 'arrow') return <line key={d.id} x1={`${d.start.x}%`} y1={`${d.start.y}%`} x2={`${d.end.x}%`} y2={`${d.end.y}%`} stroke="#FACC15" strokeWidth="4" markerEnd="url(#arrowhead)" className={pClass} onPointerDown={(e) => { if(isEraseMode){ e.stopPropagation(); setDrawings(prev => prev.filter(x => x.id !== d.id)); } }} />
                    if (d.type === 'pass') return <line key={d.id} x1={`${d.start.x}%`} y1={`${d.start.y}%`} x2={`${d.end.x}%`} y2={`${d.end.y}%`} stroke="#60A5FA" strokeWidth="4" strokeDasharray="8,8" markerEnd="url(#passhead)" className={pClass} onPointerDown={(e) => { if(isEraseMode){ e.stopPropagation(); setDrawings(prev => prev.filter(x => x.id !== d.id)); } }} />
                    if (d.type === 'zone') return <rect key={d.id} x={`${Math.min(d.start.x, d.end.x)}%`} y={`${Math.min(d.start.y, d.end.y)}%`} width={`${Math.abs(d.start.x - d.end.x)}%`} height={`${Math.abs(d.start.y - d.end.y)}%`} fill="rgba(59, 130, 246, 0.3)" stroke="#3B82F6" strokeWidth="3" className={isEraseMode ? 'pointer-events-auto cursor-pointer hover:fill-red-500/30' : ''} onPointerDown={(e) => { if(isEraseMode){ e.stopPropagation(); setDrawings(prev => prev.filter(x => x.id !== d.id)); } }} />
                    return null;
                  })}
                </svg>

                {tacticTokens.map(t => (
                  <div
                    key={t.id} id={`token-${t.id}`}
                    onPointerDown={(e) => {
                      if (currentTool !== 'move' || isPlaying) return;
                      e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
                      pointerDownInfo.current = { x: e.clientX, y: e.clientY, time: Date.now() };
                      dragStartTokensRef.current = [...tacticTokens];
                      setDraggingToken(t.id);
                    }}
                    style={{ left: `${t.x}%`, top: `${t.y}%`, transform: 'translate(-50%, -50%)' }}
                    className={`absolute rounded-full flex flex-col items-center justify-center font-black transition-transform duration-75 text-[10px] sm:text-[11px] will-change-transform 
                      ${isPlaying ? 'pointer-events-none' : (draggingToken === t.id ? 'transition-none scale-125 z-50 opacity-90 cursor-grabbing' : 'transition-transform duration-100 scale-100 z-30 cursor-grab')}
                      ${currentTool !== 'move' && !isPlaying ? 'pointer-events-none z-20' : ''}
                      ${t.team === 'A' ? 'w-8 h-8 sm:w-9 sm:h-9 bg-red-600 text-white border border-red-800 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.5),_0_2px_5px_rgba(0,0,0,0.5)]' : ''}
                      ${t.team === 'B' ? 'w-8 h-8 sm:w-9 sm:h-9 bg-blue-600 text-white border border-blue-800 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.5),_0_2px_5px_rgba(0,0,0,0.5)]' : ''}
                      ${t.team === 'ball' ? 'w-6 h-6 sm:w-7 sm:h-7 bg-white text-black shadow-[inset_0_-1px_3px_rgba(0,0,0,0.3),_0_3px_6px_rgba(0,0,0,0.6)] text-[16px]' : ''}
                    `}
                  >
                    <span>{t.team === 'ball' ? t.label : t.position}</span>
                    {t.name && <span className="absolute top-[120%] text-[10px] sm:text-[11px] font-bold text-white bg-black/80 px-2 py-0.5 rounded-full shadow-md whitespace-nowrap z-40 pointer-events-none tracking-tight">{t.name}</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 shrink-0 border-t border-slate-800 pt-2 mt-auto">
               <div className="flex items-center gap-2 bg-slate-900 rounded-2xl p-1 border border-slate-700">
                 <div className="bg-slate-800 px-2 py-2 rounded-xl text-xs font-black text-slate-300 border border-slate-700 shadow-inner flex items-center gap-1 shrink-0 w-[55px] justify-center">{animationFrames.length}컷</div>
                 <button onClick={() => {
                   if (!isAutoRecording) { setAnimationFrames([{ tokens: JSON.parse(JSON.stringify(tacticTokens)), drawings: JSON.parse(JSON.stringify(drawings)) }]); setIsAutoRecording(true); } 
                   else setIsAutoRecording(false);
                 }} disabled={isPlaying} className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow disabled:opacity-50 ${isAutoRecording ? 'bg-slate-700 text-red-400 border border-red-500/50 animate-pulse' : 'bg-red-500 hover:bg-red-400 text-white'}`}><Video size={14}/> {isAutoRecording ? '녹화 중지' : '자동 녹화'}</button>
                 <button onClick={() => {
                    if (animationFrames.length < 2) return; setIsPlaying(true); let idx = 0; let start = null;
                    const transitionDuration = 400; setTacticTokens(animationFrames[0].tokens); setDrawings(animationFrames[0].drawings);
                    const animate = (timestamp) => {
                      if (!start) start = timestamp;
                      let progress = Math.min(1, (timestamp - start) / transitionDuration);
                      const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
                      const startTokens = animationFrames[idx].tokens; const endTokens = animationFrames[idx + 1].tokens;
                      startTokens.forEach(t1 => {
                        const t2 = endTokens.find(t => t.id === t1.id) || t1;
                        const x = t1.x + (t2.x - t1.x) * ease; const y = t1.y + (t2.y - t1.y) * ease;
                        const el = document.getElementById(`token-${t1.id}`); if (el) { el.style.left = `${x}%`; el.style.top = `${y}%`; }
                      });
                      if (progress < 1) playbackRef.current = requestAnimationFrame(animate);
                      else {
                        idx++; setTacticTokens(animationFrames[idx].tokens); setDrawings(animationFrames[idx].drawings);
                        if (idx >= animationFrames.length - 1) setIsPlaying(false); else { start = null; setTimeout(() => { playbackRef.current = requestAnimationFrame(animate); }, 150); }
                      }
                    };
                    playbackRef.current = requestAnimationFrame(animate);
                 }} disabled={isPlaying || animationFrames.length < 2 || isAutoRecording} className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow disabled:opacity-50"><PlayCircle size={14}/> 재생</button>
                 <button onClick={exportAnimationToVideo} disabled={isPlaying || animationFrames.length < 2 || isAutoRecording} className="flex-1 py-2.5 bg-[#FEE500] hover:bg-[#FEE500]/90 text-slate-900 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 shadow disabled:opacity-50"><Share2 size={14}/> 영상공유</button>
                 <button onClick={() => { setAnimationFrames([]); setIsPlaying(false); setIsAutoRecording(false); if (playbackRef.current) cancelAnimationFrame(playbackRef.current); }} disabled={isPlaying || animationFrames.length === 0} className="w-10 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl flex items-center justify-center transition disabled:opacity-50 shrink-0"><Trash2 size={14}/></button>
               </div>
               <div className="flex gap-2">
                 <div className="flex-1 flex items-center justify-between bg-red-500/5 border border-red-500/20 rounded-xl p-1 pl-3">
                   <span className="text-[11px] font-bold text-red-400">A팀 선수</span>
                   <div className="flex items-center gap-0.5">
                     <button onClick={() => handleUpdatePlayerCount('A', tacticTokens.filter(t=>t.team==='A').length - 1)} disabled={isPlaying} className="w-7 h-7 flex items-center justify-center bg-slate-700/50 text-red-400 rounded-lg hover:bg-slate-600 transition font-black text-sm disabled:opacity-50">-</button>
                     <input type="number" value={tacticTokens.filter(t=>t.team==='A').length === 0 ? '' : tacticTokens.filter(t=>t.team==='A').length} readOnly className="w-7 text-center bg-transparent text-white text-[13px] font-black outline-none disabled:opacity-50" />
                     <button onClick={() => handleUpdatePlayerCount('A', tacticTokens.filter(t=>t.team==='A').length + 1)} disabled={isPlaying} className="w-7 h-7 flex items-center justify-center bg-slate-700/50 text-red-400 rounded-lg hover:bg-slate-600 transition font-black text-sm disabled:opacity-50">+</button>
                   </div>
                 </div>
                 <div className="flex-1 flex items-center justify-between bg-blue-500/5 border border-blue-500/20 rounded-xl p-1 pl-3">
                   <span className="text-[11px] font-bold text-blue-400">B팀 선수</span>
                   <div className="flex items-center gap-0.5">
                     <button onClick={() => handleUpdatePlayerCount('B', tacticTokens.filter(t=>t.team==='B').length - 1)} disabled={isPlaying} className="w-7 h-7 flex items-center justify-center bg-slate-700/50 text-blue-400 rounded-lg hover:bg-slate-600 transition font-black text-sm disabled:opacity-50">-</button>
                     <input type="number" value={tacticTokens.filter(t=>t.team==='B').length === 0 ? '' : tacticTokens.filter(t=>t.team==='B').length} readOnly className="w-7 text-center bg-transparent text-white text-[13px] font-black outline-none disabled:opacity-50" />
                     <button onClick={() => handleUpdatePlayerCount('B', tacticTokens.filter(t=>t.team==='B').length + 1)} disabled={isPlaying} className="w-7 h-7 flex items-center justify-center bg-slate-700/50 text-blue-400 rounded-lg hover:bg-slate-600 transition font-black text-sm disabled:opacity-50">+</button>
                   </div>
                 </div>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'roster' && (
          <div className="space-y-4 animate-in fade-in flex-1 overflow-y-auto hide-scrollbar">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-black text-white">팀 명단</h2>
              {isAdmin && (
                <div className="flex gap-2">
                  <button onClick={() => setSystemConfirm({isOpen: true, message: '모든 선수의 스탯을 초기화하시겠습니까?', onConfirm: () => currentTeamPlayers.forEach(p => setDoc(doc(db, 'players', p.id), { ...p, caps: 0, goals: 0, assists: 0 }))})} className="text-xs bg-red-500/10 text-red-400 px-3 py-1.5 rounded-lg font-bold border border-red-500/30 flex items-center gap-1 hover:bg-red-500/20 transition"><RotateCcw size={12}/> 초기화</button>
                  <button onClick={() => setRosterModal({isOpen: true, player: null})} className="text-xs bg-slate-800 text-blue-400 px-3 py-1.5 rounded-lg font-bold border border-blue-500/30 flex items-center gap-1 hover:bg-slate-700 transition"><Plus size={14}/> 추가</button>
                </div>
              )}
            </div>
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

      <nav className="fixed bottom-0 w-full max-w-md bg-slate-900 border-t border-slate-800 flex justify-around p-2 pb-6 z-[60]" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}>
        <button onClick={() => setActiveTab('matches')} className={`flex flex-col items-center p-2 flex-1 ${activeTab === 'matches' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}><List size={20} className="mb-1" /><span className="text-[10px] font-bold">경기</span></button>
        <button onClick={() => setActiveTab('schedule')} className={`flex flex-col items-center p-2 flex-1 ${activeTab === 'schedule' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}><Calendar size={20} className="mb-1" /><span className="text-[10px] font-bold">일정</span></button>
        <button onClick={() => setActiveTab('stats')} className={`flex flex-col items-center p-2 flex-1 ${activeTab === 'stats' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}><BarChart2 size={20} className="mb-1" /><span className="text-[10px] font-bold">통계</span></button>
        <button onClick={() => setActiveTab('tactics')} className={`flex flex-col items-center p-2 flex-1 ${activeTab === 'tactics' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}><Target size={20} className="mb-1" /><span className="text-[10px] font-bold">전술</span></button>
        <button onClick={() => setActiveTab('roster')} className={`flex flex-col items-center p-2 flex-1 ${activeTab === 'roster' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}><Users size={20} className="mb-1" /><span className="text-[10px] font-bold">명단</span></button>
      </nav>

      {renderDetailModal()}
      {renderMatchModalForm()}
      {renderAssignmentModal()}
      {renderRosterModalForm()}
      {renderAuthModal()}
      {renderCreateTeamModal()}
      {renderEditTeamModal()}
      {renderAdminPwdChangeModal()}
      {renderTeamSettingsModal()}
      {renderTokenEditModal()}
      {renderSystemModals()}
      {renderShareModal()}
      {renderGoalFlowModal()}
      {renderLogEditModal()}
      {renderQuarterEditModal()}
      {renderHiddenCaptureArea()}
      
      {}
      {galleryModal.isOpen && (
        <div className="fixed inset-0 bg-black z-[250] flex flex-col animate-in fade-in">
          <div className="flex justify-between items-center p-4 absolute top-0 w-full z-10 bg-gradient-to-b from-black/80 to-transparent">
            <div className="text-white font-bold text-sm bg-black/50 px-3 py-1.5 rounded-full">{galleryModal.currentIndex + 1} / {galleryModal.photos.length}</div>
            <div className="flex gap-4">
              {isAdmin && (
                <button onClick={() => requestDeletePhoto(galleryModal.photos[galleryModal.currentIndex].id)} className="text-white/70 hover:text-red-400 bg-black/50 p-2 rounded-full transition"><Trash2 size={20}/></button>
              )}
              <button onClick={() => setGalleryModal({ isOpen: false, photos: [], currentIndex: 0, matchId: null })} className="text-white bg-black/50 p-2 rounded-full hover:bg-black/80 transition"><X size={20}/></button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center relative overflow-hidden" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
             {galleryModal.currentIndex > 0 && (
               <button onClick={() => setGalleryModal(p => ({...p, currentIndex: p.currentIndex - 1}))} className="absolute left-4 p-3 bg-black/50 text-white rounded-full z-10 hidden sm:block"><ChevronLeft size={24}/></button>
             )}
             <img src={galleryModal.photos[galleryModal.currentIndex].url} alt="gallery" className="max-w-full max-h-full object-contain animate-in fade-in duration-300" />
             {galleryModal.currentIndex < galleryModal.photos.length - 1 && (
               <button onClick={() => setGalleryModal(p => ({...p, currentIndex: p.currentIndex + 1}))} className="absolute right-4 p-3 bg-black/50 text-white rounded-full z-10 hidden sm:block"><ChevronRight size={24}/></button>
             )}
          </div>
        </div>
      )}
    </div>
  );
}