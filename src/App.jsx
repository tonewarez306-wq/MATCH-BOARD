import React, { useState, useMemo, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { Calendar, Users, BarChart2, Plus, MapPin, Trophy, Shield, ChevronRight, ChevronLeft, X, Play, Edit, Trash2, CheckCircle, Activity, List, LogOut, Share2, MessageCircle, Footprints, Settings, Target, Undo, Redo, MousePointer, ArrowUpRight, TrendingUp, Square, XCircle, Video, PlayCircle, RotateCcw } from 'lucide-react';

const firebaseConfig = { apiKey: "AIzaSyCO99Km34_p0paqFM8wbWD0odUU8UJ9ph4", authDomain: "matchboard-d010e.firebaseapp.com", projectId: "matchboard-d010e", storageBucket: "matchboard-d010e.appspot.com", messagingSenderId: "693534026774", appId: "1:693534026774:web:a61dd8607c492e5e7c1937", measurementId: "G-VVB38BS06J" };
const app = initializeApp(firebaseConfig); const auth = getAuth(app); const db = getFirestore(app);

const TEAM_LETTERS = ['A', 'B', 'C', 'D'];
const TEAM_COLORS = { 'A': 'text-red-400 bg-red-500/10 border-red-500/30', 'B': 'text-blue-400 bg-blue-500/10 border-blue-500/30', 'C': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30', 'D': 'text-green-400 bg-green-500/10 border-green-500/30' };
const TEAM_TEXT_COLORS = { 'A': 'text-red-400', 'B': 'text-blue-400', 'C': 'text-yellow-400', 'D': 'text-green-400' };

const getMatchTeamCount = (match) => {
  if (!match) return 2; if (match.matchType === 'external') return 2;
  let maxIdx = 1; const checkTeam = (t) => { const idx = TEAM_LETTERS.indexOf(t); if (idx > maxIdx) maxIdx = idx; };
  if (match.teamAssignments) Object.values(match.teamAssignments).forEach(checkTeam);
  if (match.logs) match.logs.forEach(l => checkTeam(l.teamLetter));
  if (match.quarterScores) match.quarterScores.forEach(qs => { checkTeam(qs.team1); checkTeam(qs.team2); });
  let savedCount = parseInt(match.teamCount, 10);
  if (!isNaN(savedCount) && savedCount > maxIdx + 1) return savedCount;
  return maxIdx + 1; 
};

const getTournamentQuarterInfo = (quarter) => {
  const setNum = Math.ceil(quarter / 4); const matchInSet = (quarter - 1) % 4 + 1;
  const labels = ['1경기', '2경기', '패자전', '승자전']; return { setNum, matchInSet, title: `${setNum}세트 ${labels[matchInSet - 1]}` };
};

const getTournamentMatchup = (quarter, match, stats = null) => {
  if (!match || !match.isTournament) return ['A', 'B'];
  const { setNum, matchInSet } = getTournamentQuarterInfo(quarter);
  if (matchInSet === 1) { if (setNum === 1) return ['A', 'B']; if (setNum === 2) return ['A', 'C']; if (setNum === 3) return ['A', 'D']; }
  if (matchInSet === 2) { if (setNum === 1) return ['C', 'D']; if (setNum === 2) return ['B', 'D']; if (setNum === 3) return ['B', 'C']; }
  const qs1 = (match.quarterScores || []).find(q => q.quarter === (setNum - 1) * 4 + 1);
  const qs2 = (match.quarterScores || []).find(q => q.quarter === (setNum - 1) * 4 + 2);
  if (!qs1 || !qs2) return ['A', 'B']; 
  const resolveWinner = (qs) => {
      if (qs.score1 > qs.score2) return { w: qs.team1, l: qs.team2 };
      if (qs.score1 < qs.score2) return { w: qs.team2, l: qs.team1 };
      const p1 = stats ? stats.find(s => s.team === qs.team1) : null; const p2 = stats ? stats.find(s => s.team === qs.team2) : null;
      if (p1 && p2) {
          if (p1.gd > p2.gd) return { w: qs.team1, l: qs.team2 }; if (p1.gd < p2.gd) return { w: qs.team2, l: qs.team1 };
          if (p1.gf > p2.gf) return { w: qs.team1, l: qs.team2 }; if (p1.gf < p2.gf) return { w: qs.team2, l: qs.team1 };
      }
      return { w: qs.team1, l: qs.team2 };
  };
  const res1 = resolveWinner(qs1); const res2 = resolveWinner(qs2);
  if (matchInSet === 3) return [res1.l, res2.l]; if (matchInSet === 4) return [res1.w, res2.w]; 
  return ['A', 'B'];
};

const calculateTournamentStandings = (match) => {
  const stats = {};
  TEAM_LETTERS.forEach(t => { stats[t] = { team: t, matches: 0, setPts: 0, s1: 0, s2: 0, s3: 0, gd: 0, gf: 0, ga: 0, w: 0, d: 0, l: 0 }; });
  (match.quarterScores || []).forEach(qs => {
    const { team1, team2, score1, score2 } = qs; if (!stats[team1] || !stats[team2]) return;
    stats[team1].matches++; stats[team2].matches++;
    stats[team1].gf += score1; stats[team1].ga += score2; stats[team2].gf += score2; stats[team2].ga += score1;
    stats[team1].gd += (score1 - score2); stats[team2].gd += (score2 - score1);
    if (score1 > score2) { stats[team1].w++; stats[team2].l++; } else if (score1 < score2) { stats[team1].l++; stats[team2].w++; } else { stats[team1].d++; stats[team2].d++; }
  });
  for (let setNum = 1; setNum <= 3; setNum++) {
    const qs1 = (match.quarterScores || []).find(q => q.quarter === (setNum - 1) * 4 + 1);
    const qs2 = (match.quarterScores || []).find(q => q.quarter === (setNum - 1) * 4 + 2);
    const qs3 = (match.quarterScores || []).find(q => q.quarter === (setNum - 1) * 4 + 3);
    const qs4 = (match.quarterScores || []).find(q => q.quarter === (setNum - 1) * 4 + 4);
    let tempSetStats = {}; TEAM_LETTERS.forEach(t => tempSetStats[t] = { gd: 0, gf: 0 });
    if (qs1) { tempSetStats[qs1.team1].gd += (qs1.score1 - qs1.score2); tempSetStats[qs1.team1].gf += qs1.score1; tempSetStats[qs1.team2].gd += (qs1.score2 - qs1.score1); tempSetStats[qs1.team2].gf += qs1.score2; }
    if (qs2) { tempSetStats[qs2.team1].gd += (qs2.score1 - qs2.score2); tempSetStats[qs2.team1].gf += qs2.score1; tempSetStats[qs2.team2].gd += (qs2.score2 - qs2.score1); tempSetStats[qs2.team2].gf += qs2.score2; }
    if (qs3) { tempSetStats[qs3.team1].gd += (qs3.score1 - qs3.score2); tempSetStats[qs3.team1].gf += qs3.score1; tempSetStats[qs3.team2].gd += (qs3.score2 - qs3.score1); tempSetStats[qs3.team2].gf += qs3.score2; }
    if (qs4) { tempSetStats[qs4.team1].gd += (qs4.score1 - qs4.score2); tempSetStats[qs4.team1].gf += qs4.score1; tempSetStats[qs4.team2].gd += (qs4.score2 - qs4.score1); tempSetStats[qs4.team2].gf += qs4.score2; }
    let ranks = []; 
    if (qs4) {
      let w = qs4.team1, l = qs4.team2;
      if (qs4.score1 > qs4.score2) { w = qs4.team1; l = qs4.team2; } else if (qs4.score1 < qs4.score2) { w = qs4.team2; l = qs4.team1; }
      else {
        if (tempSetStats[qs4.team1].gd > tempSetStats[qs4.team2].gd) { w = qs4.team1; l = qs4.team2; } else if (tempSetStats[qs4.team1].gd < tempSetStats[qs4.team2].gd) { w = qs4.team2; l = qs4.team1; }
        else { if (tempSetStats[qs4.team1].gf > tempSetStats[qs4.team2].gf) { w = qs4.team1; l = qs4.team2; } else if (tempSetStats[qs4.team1].gf < tempSetStats[qs4.team2].gf) { w = qs4.team2; l = qs4.team1; } else { w = qs4.team1; l = qs4.team2; } }
      }
      ranks[0] = w; ranks[1] = l;
    }
    if (qs3) {
      let w = qs3.team1, l = qs3.team2;
      if (qs3.score1 > qs3.score2) { w = qs3.team1; l = qs3.team2; } else if (qs3.score1 < qs3.score2) { w = qs3.team2; l = qs3.team1; }
      else {
        if (tempSetStats[qs3.team1].gd > tempSetStats[qs3.team2].gd) { w = qs3.team1; l = qs3.team2; } else if (tempSetStats[qs3.team1].gd < tempSetStats[qs3.team2].gd) { w = qs3.team2; l = qs3.team1; }
        else { if (tempSetStats[qs3.team1].gf > tempSetStats[qs3.team2].gf) { w = qs3.team1; l = qs3.team2; } else if (tempSetStats[qs3.team1].gf < tempSetStats[qs3.team2].gf) { w = qs3.team2; l = qs3.team1; } else { w = qs3.team1; l = qs3.team2; } }
      }
      ranks[2] = w; ranks[3] = l;
    }
    if (ranks[0]) { stats[ranks[0]].setPts += 4; stats[ranks[0]][`s${setNum}`] = 4; }
    if (ranks[1]) { stats[ranks[1]].setPts += 3; stats[ranks[1]][`s${setNum}`] = 3; }
    if (ranks[2]) { stats[ranks[2]].setPts += 2; stats[ranks[2]][`s${setNum}`] = 2; }
    if (ranks[3]) { stats[ranks[3]].setPts += 1; stats[ranks[3]][`s${setNum}`] = 1; }
  }
  return Object.values(stats).sort((a, b) => { if (b.setPts !== a.setPts) return b.setPts - a.setPts; if (b.gd !== a.gd) return b.gd - a.gd; return b.gf - a.gf; });
};

const calculateStandings = (match) => {
  if (match.isTournament) return calculateTournamentStandings(match);
  const stats = {}; const actualTeamCount = getMatchTeamCount(match); 
  TEAM_LETTERS.slice(0, actualTeamCount).forEach(t => { stats[t] = { team: t, matches: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }; });
  (match.quarterScores || []).forEach(qs => {
    const { team1, team2, score1, score2 } = qs; if (!stats[team1] || !stats[team2]) return;
    stats[team1].matches++; stats[team2].matches++; stats[team1].gf += score1; stats[team1].ga += score2; stats[team2].gf += score2; stats[team2].ga += score1;
    if (score1 > score2) { stats[team1].w++; stats[team2].l++; stats[team1].pts += 3; } else if (score1 < score2) { stats[team2].w++; stats[team1].l++; stats[team2].pts += 3; } else { stats[team1].d++; stats[team2].d++; stats[team1].pts += 1; stats[team2].pts += 1; }
  });
  Object.values(stats).forEach(s => s.gd = s.gf - s.ga);
  return Object.values(stats).sort((a, b) => { if (b.pts !== a.pts) return b.pts - a.pts; if (b.gd !== a.gd) return b.gd - a.gd; return b.gf - a.gf; });
};

const resizeImage = (file, maxWidth = 800, maxHeight = 800, quality = 0.6) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image(); img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas'); let width = img.width; let height = img.height;
        if (width > height) { if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; } } 
        else { if (height > maxHeight) { width = Math.round((width * maxHeight) / height); height = maxHeight; } }
        canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality)); 
      };
    }; reader.readAsDataURL(file);
  });
};

const loadHtml2Canvas = () => {
  return new Promise((resolve, reject) => {
    if (window.html2canvas) { resolve(window.html2canvas); return; }
    const script = document.createElement('script'); script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.onload = () => resolve(window.html2canvas); script.onerror = () => reject(new Error('html2canvas 로드 실패'));
    document.head.appendChild(script);
  });
};

const formatTimeAmPm = (timeStr) => {
  if (!timeStr) return ''; const [h, m] = timeStr.split(':'); const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? '오후' : '오전'; const formattedHour = hour % 12 || 12; return `${ampm} ${formattedHour}:${m}`;
};

const getTodayString = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

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

const SESSION_STORAGE_KEY = 'matchboard_session_v1';
const loadSavedSession = () => {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
};

export default function App() {
  const savedSession = useMemo(() => loadSavedSession(), []);
  const [user, setUser] = useState(null);
  const [appState, setAppState] = useState(() => (savedSession?.activeTeamId ? (savedSession.appState || 'main') : 'login')); 
  const [activeTab, setActiveTab] = useState(() => savedSession?.activeTab || 'matches'); 
  const [statsPeriod, setStatsPeriod] = useState('month'); 
  const [statsType, setStatsType] = useState('total'); 
  const [isAdmin, setIsAdmin] = useState(() => !!savedSession?.isAdmin); 
  const [adminPassword, setAdminPassword] = useState('admin');
  const [isLoaded, setIsLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); 
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [teams, setTeams] = useState([]);
  const [activeTeamId, setActiveTeamId] = useState(() => savedSession?.activeTeamId || null);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [memos, setMemos] = useState({});

  const [viewDate, setViewDate] = useState(new Date());

  const [systemAlert, setSystemAlert] = useState({ isOpen: false, message: '' });
  const [systemConfirm, setSystemConfirm] = useState({ isOpen: false, message: '', onConfirm: null });

  const [authModal, setAuthModal] = useState({ isOpen: false, type: '', targetTeam: null }); 
  const [roleSelectModal, setRoleSelectModal] = useState({ isOpen: false, team: null });
  const [tacticsTutorialModal, setTacticsTutorialModal] = useState(false);
  const [installGuideModal, setInstallGuideModal] = useState(false);
  const [installGuideTab, setInstallGuideTab] = useState(() => {
    if (typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'ios';
    return 'android';
  });
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [dateMemoModal, setDateMemoModal] = useState({ isOpen: false, dateStr: null, matches: [], memo: '' });
  
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

  const [liveMatchId, setLiveMatchId] = useState(() => savedSession?.liveMatchId || null);
  const [liveState, setLiveState] = useState(() => savedSession?.liveState || { currentQuarter: 1, playingTeams: ['A', 'B'], isQuarterActive: false, gk1: null, gk2: null });
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
  
  const playbackRef = useRef(null); const boardRef = useRef(null); const pointerDownInfo = useRef({ x: 0, y: 0, time: 0 }); const dragStartTokensRef = useRef(null); const activeDrawingData = useRef(null); const svgArrowRef = useRef(null); const svgPassRef = useRef(null); const svgZoneRef = useRef(null);

  // GPS 분석 및 트래커 상태
  const [gpsSession, setGpsSession] = useState(null);
  const [gpsViewMode, setGpsViewMode] = useState('heatmap'); // 'heatmap' | 'sprint' | 'replay'
  const [gpsFlipVertical, setGpsFlipVertical] = useState(false);
  const [gpsRotate90, setGpsRotate90] = useState(false);
  const [gpsSelectedPlayerId, setGpsSelectedPlayerId] = useState('');
  const [gpsQuarterLabel, setGpsQuarterLabel] = useState('1Q');
  const [gpsReplayPlaying, setGpsReplayPlaying] = useState(false);
  const [gpsReplayProgress, setGpsReplayProgress] = useState(0); // 0..100
  const [gpsReplaySpeed, setGpsReplaySpeed] = useState(2); // 1 | 2 | 4
  const [gpsGuideModal, setGpsGuideModal] = useState(false);
  const [gpsGuideTab, setGpsGuideTab] = useState(() => (typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)) ? 'ios' : 'android');
  const [isLiveGpsTracking, setIsLiveGpsTracking] = useState(false);
  const [liveGpsStats, setLiveGpsStats] = useState({ elapsedSec: 0, distanceKm: 0, currentSpeedKmh: 0, maxSpeedKmh: 0, pointCount: 0 });
  const gpsCanvasRef = useRef(null);
  const gpsCardCaptureRef = useRef(null);
  const gpsReplayRafRef = useRef(null);
  const liveGpsWatchIdRef = useRef(null);
  const liveGpsTimerRef = useRef(null);
  const liveGpsPointsRef = useRef([]);
  const wakeLockRef = useRef(null);

  const activeTeam = useMemo(() => teams.find(t => t.id === activeTeamId), [teams, activeTeamId]);
  const currentTeamPlayers = useMemo(() => players.filter(p => p.teamId === activeTeamId), [players, activeTeamId]);
  const currentTeamMatches = useMemo(() => matches.filter(m => m.teamId === activeTeamId), [matches, activeTeamId]);
  const liveMatch = useMemo(() => matches.find(m => m.id === liveMatchId), [matches, liveMatchId]);
  const detailMatch = useMemo(() => matches.find(m => m.id === detailModalMatchId), [matches, detailModalMatchId]);

  const checkCanEdit = (match) => { if (isAdmin) return true; if (!match) return false; if (match.status === 'completed') return false; const safeDate = match.date.replace(/-/g, '/'); const matchDateTime = new Date(`${safeDate} ${match.time}`); return new Date() >= matchDateTime; };
  const getTeamDisplayName = (match, letter) => { if (!match) return `${letter}팀`; if (match.matchType === 'external') { if (letter === 'A') return activeTeam?.name || '우리 팀'; if (letter === 'B') return match.opponentName || '상대 팀'; } return `${letter}팀`; };
  const getGkDisplayName = (gkId) => { if (!gkId) return null; if (gkId === 'mercenary') return '용병'; return players.find(p => p.id === gkId)?.name || null; };
  const getTeamCandidatePlayers = (match, teamLetter) => {
    const isExternalOpponent = match?.matchType === 'external' && teamLetter === 'B';
    if (isExternalOpponent) return { teamPlayers: [], otherPlayers: [] };
    const teamRoster = players.filter(p => p.teamId === activeTeamId);
    const hasAttendees = (match?.attendees || []).length > 0;
    const basePlayers = hasAttendees ? teamRoster.filter(p => (match.attendees || []).includes(p.id)) : teamRoster;
    if (match?.matchType === 'external') return { teamPlayers: basePlayers, otherPlayers: [] };
    const assignedTeamPlayers = basePlayers.filter(p => ((match?.teamAssignments || {})[p.id]) === teamLetter);
    const teamPlayers = assignedTeamPlayers.length > 0 ? assignedTeamPlayers : basePlayers;
    const otherPlayers = assignedTeamPlayers.length > 0
      ? basePlayers.filter(p => ((match?.teamAssignments || {})[p.id]) !== teamLetter)
      : teamRoster.filter(p => !basePlayers.some(bp => bp.id === p.id));
    return { teamPlayers, otherPlayers };
  };
  const getLastGkForTeam = (match, teamLetter) => {
    const qScores = [...(match?.quarterScores || [])].sort((a, b) => b.quarter - a.quarter);
    for (const qs of qScores) {
      if (qs.team1 === teamLetter && qs.gk1) return qs.gk1;
      if (qs.team2 === teamLetter && qs.gk2) return qs.gk2;
    }
    return null;
  };
  const getMatchResultBadge = (m) => {
    if (!m || m.status !== 'completed') return null;
    const makeBadge = (label, detail, className) => ({ label, detail, className, text: label, score: detail, color: className });
    const qScores = m.quarterScores || [];
    if (m.matchType === 'external') {
      const standings = calculateStandings(m);
      const sA = standings.find(s => s.team === 'A');
      const sB = standings.find(s => s.team === 'B');
      if (qScores.length > 0 && sA && sB) {
        const diff = sA.pts !== sB.pts ? sA.pts - sB.pts : (sA.gd !== sB.gd ? sA.gd - sB.gd : sA.gf - sB.gf);
        const recordText = `${sA.w}승${sA.d ? ` ${sA.d}무` : ''}${sA.l ? ` ${sA.l}패` : ''}`;
        if (diff > 0) return makeBadge('승', recordText, 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40');
        if (diff < 0) return makeBadge('패', recordText, 'bg-red-500/20 text-red-400 border-red-500/40');
        return makeBadge('무', recordText, 'bg-slate-600/30 text-slate-300 border-slate-500/40');
      }
      const scoreA = m.scores?.A || 0; const scoreB = m.scores?.B || 0;
      if (scoreA > scoreB) return makeBadge('승', `${scoreA}:${scoreB}`, 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40');
      if (scoreA < scoreB) return makeBadge('패', `${scoreA}:${scoreB}`, 'bg-red-500/20 text-red-400 border-red-500/40');
      return makeBadge('무', `${scoreA}:${scoreB}`, 'bg-slate-600/30 text-slate-300 border-slate-500/40');
    }
    if (qScores.length > 0) {
      const standings = calculateStandings(m);
      const top = standings[0]; const second = standings[1];
      if (top && second) {
        const topPts = m.isTournament ? top.setPts : top.pts;
        const secondPts = m.isTournament ? second.setPts : second.pts;
        if (topPts === 0 && secondPts === 0) return null;
        if (topPts === secondPts && top.gd === second.gd && top.gf === second.gf) {
          return makeBadge('무', '동률', 'bg-slate-600/30 text-slate-300 border-slate-500/40');
        }
        return makeBadge(`${top.team}팀 승`, `${top.team}팀 1위`, 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40');
      }
    }
    return null;
  };

  const viewYearMonth = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;
  const viewYear = `${viewDate.getFullYear()}`;
  const monthlyMatches = useMemo(() => currentTeamMatches.filter(m => m.date.startsWith(viewYearMonth)), [currentTeamMatches, viewYearMonth]);
  const yearlyMatches = useMemo(() => currentTeamMatches.filter(m => m.date.startsWith(viewYear)), [currentTeamMatches, viewYear]);
  const scheduledThisMonth = useMemo(() => monthlyMatches.filter(m => m.status === 'scheduled').sort((a,b) => a.date.localeCompare(b.date)), [monthlyMatches]);
  const completedThisMonthWithStandings = useMemo(() => { return monthlyMatches.filter(m => m.status === 'completed').sort((a,b) => b.date.localeCompare(a.date)).map(m => ({ ...m, standings: calculateStandings(m) })); }, [monthlyMatches]);
  const matchesByDate = useMemo(() => { const map = {}; monthlyMatches.forEach(m => { if (!map[m.date]) map[m.date] = []; map[m.date].push(m); }); return map; }, [monthlyMatches]);

  const calculatedPlayersList = useMemo(() => {
    const stats = {}; currentTeamPlayers.forEach(p => { stats[p.id] = { ...p, trueCaps: 0, trueGoals: 0, trueAssists: 0, trueGkQuarters: 0, trueGoalsConceded: 0, trueCleanSheets: 0 }; });
    const completedMatches = currentTeamMatches.filter(m => m.status === 'completed' && m.matchType !== 'futsal');
    completedMatches.forEach(m => {
      (m.attendees || []).forEach(pid => { if (stats[pid]) stats[pid].trueCaps += 1; });
      (m.logs || []).forEach(log => { if (log.scorerId && stats[log.scorerId]) stats[log.scorerId].trueGoals += 1; if (log.assistId && stats[log.assistId]) stats[log.assistId].trueAssists += 1; });
      (m.quarterScores || []).forEach(qs => {
        if (qs.gk1 && stats[qs.gk1]) {
          stats[qs.gk1].trueGkQuarters += 1;
          stats[qs.gk1].trueGoalsConceded += (qs.score2 || 0);
          if ((qs.score2 || 0) === 0) stats[qs.gk1].trueCleanSheets += 1;
        }
        if (qs.gk2 && stats[qs.gk2]) {
          stats[qs.gk2].trueGkQuarters += 1;
          stats[qs.gk2].trueGoalsConceded += (qs.score1 || 0);
          if ((qs.score1 || 0) === 0) stats[qs.gk2].trueCleanSheets += 1;
        }
      });
    });
    return Object.values(stats).sort((a,b) => b.trueCaps !== a.trueCaps ? b.trueCaps - a.trueCaps : b.trueGoals - a.trueGoals);
  }, [currentTeamPlayers, currentTeamMatches]);

  const filteredStats = useMemo(() => {
    const statsMap = {}; currentTeamPlayers.forEach(p => { statsMap[p.id] = { id: p.id, name: p.name, caps: 0, goals: 0, assists: 0, gkQuarters: 0, goalsConceded: 0, cleanSheets: 0 }; });
    let targetMatches = currentTeamMatches.filter(m => m.status === 'completed');
    if (statsPeriod === 'month') targetMatches = targetMatches.filter(m => m.date.startsWith(viewYearMonth)); else if (statsPeriod === 'year') targetMatches = targetMatches.filter(m => m.date.startsWith(viewYear));
    if (statsType === 'total') targetMatches = targetMatches.filter(m => m.matchType === 'internal' || m.matchType === 'external'); else targetMatches = targetMatches.filter(m => m.matchType === statsType);
    targetMatches.forEach(m => {
      (m.attendees || []).forEach(pId => { if(statsMap[pId]) statsMap[pId].caps += 1; });
      (m.logs || []).forEach(log => { if (log.scorerId && statsMap[log.scorerId]) statsMap[log.scorerId].goals += 1; if (log.assistId && statsMap[log.assistId]) statsMap[log.assistId].assists += 1; });
      (m.quarterScores || []).forEach(qs => {
        if (qs.gk1 && statsMap[qs.gk1]) {
          statsMap[qs.gk1].gkQuarters += 1;
          statsMap[qs.gk1].goalsConceded += (qs.score2 || 0);
          if ((qs.score2 || 0) === 0) statsMap[qs.gk1].cleanSheets += 1;
        }
        if (qs.gk2 && statsMap[qs.gk2]) {
          statsMap[qs.gk2].gkQuarters += 1;
          statsMap[qs.gk2].goalsConceded += (qs.score1 || 0);
          if ((qs.score1 || 0) === 0) statsMap[qs.gk2].cleanSheets += 1;
        }
      });
    });
    return Object.values(statsMap).map(s => ({
      ...s,
      gaRate: s.gkQuarters > 0 ? s.goalsConceded / s.gkQuarters : null,
      cleanSheetRate: s.gkQuarters > 0 ? Math.round((s.cleanSheets / s.gkQuarters) * 100) : 0
    })).sort((a, b) => b.goals !== a.goals ? b.goals - a.goals : (b.assists !== a.assists ? b.assists - a.assists : b.caps - a.caps));
  }, [currentTeamMatches, currentTeamPlayers, statsPeriod, viewYearMonth, viewYear, statsType]);

  const gkStatsList = useMemo(() => {
    return filteredStats
      .filter(s => s.gkQuarters > 0)
      .sort((a, b) => a.gaRate !== b.gaRate ? a.gaRate - b.gaRate : (b.cleanSheets !== a.cleanSheets ? b.cleanSheets - a.cleanSheets : b.gkQuarters - a.gkQuarters));
  }, [filteredStats]);

  const titlePrefix = statsPeriod === 'month' ? '이달의' : '올해의';
  const maxGoals = filteredStats.length > 0 ? Math.max(...filteredStats.map(s => s.goals)) : 0; const topScorers = filteredStats.filter(s => s.goals === maxGoals && maxGoals > 0);
  const maxAssists = filteredStats.length > 0 ? Math.max(...filteredStats.map(s => s.assists)) : 0; const topAssists = filteredStats.filter(s => s.assists === maxAssists && maxAssists > 0);
  const maxCaps = filteredStats.length > 0 ? Math.max(...filteredStats.map(s => s.caps)) : 0; const topCaps = filteredStats.filter(s => s.caps === maxCaps && maxCaps > 0);
  const minGaRate = gkStatsList.length > 0 ? Math.min(...gkStatsList.map(s => s.gaRate)) : null;
  const topGks = minGaRate !== null ? gkStatsList.filter(s => Math.abs(s.gaRate - minGaRate) < 1e-6) : [];

  const globalStyles = ( <style>{` html, body { overscroll-behavior: none !important; -webkit-text-size-adjust: 100%; -webkit-tap-highlight-color: transparent; } *::-webkit-scrollbar { display: none !important; width: 0 !important; } * { -ms-overflow-style: none !important; scrollbar-width: none !important; -webkit-tap-highlight-color: transparent; } input, textarea { font-size: 16px; } input[type="number"]::-webkit-outer-spin-button, input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; } input[type="number"] { -moz-appearance: textfield; } .will-change-transform { will-change: transform, left, top; } `}</style> );

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    let unsubTeams = () => {}; let unsubPlayers = () => {}; let unsubMatches = () => {}; let unsubMemos = () => {};
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
         setUser(currentUser);
         unsubTeams = onSnapshot(collection(db, 'teams'), snap => { setTeams(snap.docs.map(d => d.data())); setIsLoaded(true); }, error => { console.error("Teams fetch error:", error); setSystemAlert({ isOpen: true, message: `데이터베이스 접근 권한이 없습니다.\nFirebase Firestore 규칙을 확인해주세요.` }); setIsLoaded(true); });
         if (activeTeamId) {
            unsubPlayers = onSnapshot(query(collection(db, 'players'), where('teamId', '==', activeTeamId)), snap => setPlayers(snap.docs.map(d => d.data())));
            unsubMatches = onSnapshot(query(collection(db, 'matches'), where('teamId', '==', activeTeamId)), snap => setMatches(snap.docs.map(d => d.data())));
            unsubMemos = onSnapshot(query(collection(db, 'memos'), where('teamId', '==', activeTeamId)), snap => { const memoMap = {}; snap.docs.forEach(d => { memoMap[d.data().date] = d.data().content; }); setMemos(memoMap); });
         }
      } else { signInAnonymously(auth).catch(console.error); }
    });
    return () => { unsubscribeAuth(); unsubTeams(); unsubPlayers(); unsubMatches(); unsubMemos(); };
  }, [activeTeamId]);

  useEffect(() => { return () => { if (playbackRef.current) cancelAnimationFrame(playbackRef.current); }; }, []);

  // 세션 및 현재 화면 상태 localStorage 자동 저장 (뒤로가기 종료 후 재진입 시에도 화면 유지)
  useEffect(() => {
    try {
      if (!activeTeamId || appState === 'login') {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      } else {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
          activeTeamId,
          appState,
          activeTab,
          isAdmin,
          liveMatchId,
          liveState
        }));
      }
    } catch (e) {}
  }, [activeTeamId, appState, activeTab, isAdmin, liveMatchId, liveState]);

  const computeDerivedLiveState = (match) => {
    if (!match) return { currentQuarter: 1, playingTeams: ['A', 'B'], isQuarterActive: false, gk1: null, gk2: null };
    const qScores = match.quarterScores || [];
    const mLogs = match.logs || [];
    const currentQ = qScores.length + 1;
    const currentLogs = mLogs.filter(l => l.quarter === currentQ);
    if (match.liveStatus && match.liveStatus.currentQuarter === currentQ) {
      return {
        currentQuarter: currentQ,
        playingTeams: match.liveStatus.playingTeams || ['A', 'B'],
        isQuarterActive: currentLogs.length > 0 ? true : !!match.liveStatus.isQuarterActive,
        gk1: match.liveStatus.gk1 ?? getLastGkForTeam(match, (match.liveStatus.playingTeams || ['A', 'B'])[0]),
        gk2: match.matchType === 'external' ? null : (match.liveStatus.gk2 ?? getLastGkForTeam(match, (match.liveStatus.playingTeams || ['A', 'B'])[1]))
      };
    }
    const stats = match.isTournament ? calculateTournamentStandings(match) : null;
    let playingTeams = match.isTournament ? getTournamentMatchup(currentQ, match, stats) : ['A', 'B'];
    let isQuarterActive = false;
    if (match.matchType === 'external') {
      if (currentLogs.length > 0) isQuarterActive = true;
    } else {
      if (currentLogs.length > 0) {
        const teamsInLogs = [...new Set(currentLogs.map(l => l.teamLetter))];
        if (teamsInLogs.length === 2) playingTeams = teamsInLogs;
        else if (teamsInLogs.length === 1) playingTeams = [teamsInLogs[0], TEAM_LETTERS.find(t => t !== teamsInLogs[0])];
        isQuarterActive = true;
      }
    }
    const initialGk1 = getLastGkForTeam(match, playingTeams[0]);
    const initialGk2 = match.matchType === 'external' ? null : getLastGkForTeam(match, playingTeams[1]);
    return { currentQuarter: currentQ, playingTeams, isQuarterActive, gk1: initialGk1, gk2: initialGk2 };
  };

  // 다중 접속 시 실시간으로 liveMatch의 쿼터/진행상태/골키퍼 동기화
  useEffect(() => {
    if (appState !== 'liveMatch' || !liveMatchId) return;
    if (!liveMatch) return;
    if (liveMatch.status === 'completed') {
      setAppState('main');
      setLiveMatchId(null);
      return;
    }
    const derived = computeDerivedLiveState(liveMatch);
    setLiveState(prev => {
      if (
        prev.currentQuarter === derived.currentQuarter &&
        prev.isQuarterActive === derived.isQuarterActive &&
        prev.playingTeams[0] === derived.playingTeams[0] &&
        prev.playingTeams[1] === derived.playingTeams[1] &&
        prev.gk1 === derived.gk1 &&
        prev.gk2 === derived.gk2
      ) {
        return prev;
      }
      return derived;
    });
  }, [appState, liveMatchId, liveMatch]);

  const updateLiveStateAndSync = (patch) => {
    setLiveState(prev => {
      const next = { ...prev, ...patch };
      if (liveMatch && liveMatchId) {
        setDoc(doc(db, 'matches', liveMatchId), {
          ...liveMatch,
          liveStatus: {
            currentQuarter: next.currentQuarter,
            playingTeams: next.playingTeams,
            isQuarterActive: next.isQuarterActive,
            gk1: next.gk1 || null,
            gk2: next.gk2 || null,
            updatedAt: Date.now()
          }
        }).catch(console.error);
      }
      return next;
    });
  };

  const handleManualRefresh = async () => {
    if (isRefreshing || !activeTeamId) return;
    setIsRefreshing(true);
    try {
      const [pSnap, mSnap] = await Promise.all([
        getDocs(query(collection(db, 'players'), where('teamId', '==', activeTeamId))),
        getDocs(query(collection(db, 'matches'), where('teamId', '==', activeTeamId)))
      ]);
      const freshPlayers = pSnap.docs.map(d => d.data());
      const freshMatches = mSnap.docs.map(d => d.data());
      setPlayers(freshPlayers);
      setMatches(freshMatches);
      if (liveMatchId) {
        const freshLive = freshMatches.find(m => m.id === liveMatchId);
        if (freshLive) {
          if (freshLive.status === 'completed') {
            setAppState('main');
            setLiveMatchId(null);
          } else {
            setLiveState(computeDerivedLiveState(freshLive));
          }
        }
      }
    } catch (e) {
      console.error('Refresh error:', e);
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  // 디바이스 뒤로가기(Back) 버튼 제어
  const backStateRef = useRef({});
  backStateRef.current = {
    appState, activeTab, goalFlow, logEditModal, quarterEditModal, detailModal,
    assignmentModal, matchModal, rosterModal, dateMemoModal, galleryModal,
    shareModal, tacticsTutorialModal, teamSettingsModal, authModal
  };

  useEffect(() => {
    if (appState === 'login') return;
    window.history.pushState({ matchboardGuard: true }, '');
    const handlePopState = () => {
      const st = backStateRef.current;
      if (st.galleryModal.isOpen) { setGalleryModal({ isOpen: false, photos: [], currentIndex: 0, matchId: null }); window.history.pushState({ matchboardGuard: true }, ''); return; }
      if (st.shareModal.isOpen) { setShareModal({ isOpen: false, step: 1, data: null, file: null, imgUrl: null, isVideo: false }); window.history.pushState({ matchboardGuard: true }, ''); return; }
      if (st.goalFlow.isOpen) { setGoalFlow({ isOpen: false, step: 1, matchId: null, quarter: null, teamLetter: null, availableTeams: [], scorer: null, isPK: false, remark: '', isMissingAdd: false }); setShowOtherTeams(false); window.history.pushState({ matchboardGuard: true }, ''); return; }
      if (st.logEditModal.isOpen) { setLogEditModal({ isOpen: false, match: null, log: null }); window.history.pushState({ matchboardGuard: true }, ''); return; }
      if (st.quarterEditModal.isOpen) { setQuarterEditModal({ isOpen: false, match: null, quarterScore: null }); window.history.pushState({ matchboardGuard: true }, ''); return; }
      if (st.assignmentModal.isOpen) { setAssignmentModal({ isOpen: false, match: null }); window.history.pushState({ matchboardGuard: true }, ''); return; }
      if (st.detailModal.isOpen) { setDetailModal({ isOpen: false, match: null }); window.history.pushState({ matchboardGuard: true }, ''); return; }
      if (st.matchModal.isOpen) { setMatchModal({ isOpen: false, match: null }); window.history.pushState({ matchboardGuard: true }, ''); return; }
      if (st.rosterModal.isOpen) { setRosterModal({ isOpen: false, player: null }); window.history.pushState({ matchboardGuard: true }, ''); return; }
      if (st.dateMemoModal.isOpen) { setDateMemoModal({ isOpen: false, dateStr: null, matches: [], memo: '' }); window.history.pushState({ matchboardGuard: true }, ''); return; }
      if (st.tacticsTutorialModal) { setTacticsTutorialModal(false); window.history.pushState({ matchboardGuard: true }, ''); return; }
      if (st.teamSettingsModal) { setTeamSettingsModal(false); window.history.pushState({ matchboardGuard: true }, ''); return; }
      if (st.authModal.isOpen) { setAuthModal({ isOpen: false, type: '', targetTeam: null }); window.history.pushState({ matchboardGuard: true }, ''); return; }
      if (st.appState === 'liveMatch') { setAppState('main'); window.history.pushState({ matchboardGuard: true }, ''); return; }
      if (st.activeTab !== 'matches') { setActiveTab('matches'); window.history.pushState({ matchboardGuard: true }, ''); return; }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [appState === 'login']);

  const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  const prevYear = () => setViewDate(new Date(viewDate.getFullYear() - 1, viewDate.getMonth(), 1));
  const nextYear = () => setViewDate(new Date(viewDate.getFullYear() + 1, viewDate.getMonth(), 1));
  const openMatchModal = (match) => { setMatchTypeForm(match?.matchType || 'internal'); setMatchModal({ isOpen: true, match }); };

  const saveMemo = async (dateStr, content) => {
    if (isProcessing) return; setIsProcessing(true);
    try {
       const memoId = `${activeTeamId}_${dateStr}`;
       if (!content || content.trim() === '') await deleteDoc(doc(db, 'memos', memoId)); else await setDoc(doc(db, 'memos', memoId), { teamId: activeTeamId, date: dateStr, content });
    } finally { setIsProcessing(false); }
  };

  const handleActionClick = (action, match) => {
    if (!checkCanEdit(match)) { setSystemAlert({ isOpen: true, message: `경기 시간 이후에만 기록이 가능합니다.\n(관리자는 언제든 가능)` }); return; }
    if (action === 'assign') setAssignmentModal({ isOpen: true, match });
    if (action === 'start') {
      if (match.matchType !== 'external') {
         const attendees = match.attendees || []; const assignments = match.teamAssignments || {}; const unassigned = attendees.filter(id => !assignments[id]);
         if (attendees.length > 0 && unassigned.length > 0) { setSystemConfirm({ isOpen: true, message: `아직 팀 편성이 안 된 참석자가 ${unassigned.length}명 있습니다.\n먼저 팀을 나누시겠습니까?`, onConfirm: () => setAssignmentModal({ isOpen: true, match }) }); return; }
      }
      const nextLiveState = computeDerivedLiveState(match);
      setLiveMatchId(match.id);
      setLiveState(nextLiveState);
      setAppState('liveMatch');
    }
  };

  const handleAuthSubmit = (e) => {
    e.preventDefault(); const pwd = e.target.password.value;
    if (authModal.type === 'loginAdminAuth') { if (pwd === adminPassword) { setIsLoginAdminMode(true); setAuthModal({ isOpen: false }); } else setSystemAlert({ isOpen: true, message: '시스템 관리자 비밀번호가 틀렸습니다.' }); }
    else if (authModal.type === 'adminCreate') { if (pwd === adminPassword) { setAuthModal({ isOpen: false }); setIsCreateTeamOpen(true); } else setSystemAlert({ isOpen: true, message: '시스템 관리자 비밀번호가 틀렸습니다.' }); }
    else if (authModal.type === 'adminMode') { if (pwd === (activeTeam?.adminPassword || activeTeam?.password || 'admin') || pwd === activeTeam?.password) { setIsAdmin(true); setAuthModal({ isOpen: false }); } else setSystemAlert({ isOpen: true, message: '관리자 비밀번호가 틀렸습니다.' }); }
    else if (authModal.type === 'teamLoginView') { if (pwd === authModal.targetTeam.password) { setActiveTeamId(authModal.targetTeam.id); setIsAdmin(false); setAppState('main'); setAuthModal({ isOpen: false }); } else setSystemAlert({ isOpen: true, message: '일반 팀원 비밀번호가 틀렸습니다.' }); }
    else if (authModal.type === 'teamLoginAdmin') { if (pwd === authModal.targetTeam.adminPassword) { setActiveTeamId(authModal.targetTeam.id); setIsAdmin(true); setAppState('main'); setAuthModal({ isOpen: false }); } else setSystemAlert({ isOpen: true, message: '팀 관리자 비밀번호가 틀렸습니다.' }); }
  };

  const logout = () => {
    try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch (e) {}
    setActiveTeamId(null); setIsAdmin(false); setLiveMatchId(null); setAppState('login'); setAuthModal({ isOpen: false, type: '', targetTeam: null });
  };

  const saveMatch = async (e) => {
    e.preventDefault(); if(isProcessing) return; setIsProcessing(true);
    try {
      const fd = new FormData(e.target); const attendees = currentTeamPlayers.filter(p => fd.get(`attendee_${p.id}`)).map(p => p.id);
      const matchType = matchTypeForm; const isTournament = fd.get('isTournament') === 'true'; const opponentName = matchType === 'external' ? fd.get('opponentName') : '';
      const teamCount = isTournament ? 4 : (matchType === 'external' ? 2 : parseInt(fd.get('teamCount'))); const totalQuarters = isTournament ? 12 : parseInt(fd.get('totalQuarters'));
      const newAssignments = { ...(matchModal.match?.teamAssignments || {}) }; attendees.forEach(pId => { if (matchType === 'external') newAssignments[pId] = 'A'; });
      const matchId = matchModal.match?.id || 'm' + Date.now().toString();
      if (matchModal.match?.status === 'completed') {
        const oldAttendees = matchModal.match.attendees || []; const added = attendees.filter(id => !oldAttendees.includes(id)); const removed = oldAttendees.filter(id => !attendees.includes(id)); const updatePromises = [];
        for (const id of added) { const p = players.find(x => x.id === id); if (p) updatePromises.push(setDoc(doc(db, 'players', id), { ...p, caps: (p.caps || 0) + 1 })); }
        for (const id of removed) { const p = players.find(x => x.id === id); if (p) updatePromises.push(setDoc(doc(db, 'players', id), { ...p, caps: Math.max(0, (p.caps || 0) - 1) })); }
        if (updatePromises.length > 0) await Promise.all(updatePromises);
      }
      const newMatch = { ...matchModal.match, id: matchId, teamId: activeTeamId, date: fd.get('date'), time: fd.get('time'), location: fd.get('location'), matchType, opponentName, teamCount, isTournament, totalQuarters, attendees, teamAssignments: newAssignments, scores: matchModal.match?.scores || { A: 0, B: 0, C: 0, D: 0 }, quarterScores: matchModal.match?.quarterScores || [], logs: matchModal.match?.logs || [], status: matchModal.match?.status || 'scheduled' };
      await setDoc(doc(db, 'matches', matchId), newMatch); setMatchModal({ isOpen: false, match: null });
    } finally { setIsProcessing(false); }
  };

  const requestDeleteTeam = (id) => { setSystemConfirm({ isOpen: true, message: '정말 삭제하시겠습니까?\n복구할 수 없습니다.', onConfirm: async () => { if(isProcessing) return; setIsProcessing(true); await deleteDoc(doc(db, 'teams', id)); setIsProcessing(false); } }); };
  const requestDeleteMatch = (id) => { setSystemConfirm({ isOpen: true, message: '정말 삭제하시겠습니까?', onConfirm: async () => { if(isProcessing) return; setIsProcessing(true); await deleteDoc(doc(db, 'matches', id)); setMatchModal({ isOpen: false, match: null }); setDetailModal({isOpen: false, match: null}); setIsProcessing(false); } }); };

  const saveRoster = async (e) => {
    e.preventDefault(); if(isProcessing) return; setIsProcessing(true);
    try {
      const fd = new FormData(e.target); const playerId = rosterModal.player?.id || 'p' + Date.now();
      const newPlayer = { ...rosterModal.player, id: playerId, teamId: activeTeamId, name: fd.get('name'), birthYear: parseInt(fd.get('birthYear')), goals: rosterModal.player?.goals || 0, assists: rosterModal.player?.assists || 0, caps: rosterModal.player?.caps || 0 };
      await setDoc(doc(db, 'players', playerId), newPlayer); setRosterModal({ isOpen: false, player: null });
    } finally { setIsProcessing(false); }
  };

  const requestDeleteRoster = (id) => { setSystemConfirm({ isOpen: true, message: '명단에서 삭제하시겠습니까?', onConfirm: async () => { if(isProcessing) return; setIsProcessing(true); await deleteDoc(doc(db, 'players', id)); setRosterModal({ isOpen: false, player: null }); setIsProcessing(false); } }); };

  const assignTeam = (playerId, teamLetter) => {
    const m = assignmentModal.match;
    if(m) {
      const currentTeam = m.teamAssignments?.[playerId] || null; if (currentTeam === teamLetter) return;
      const updatedMatch = { ...m, teamAssignments: { ...m.teamAssignments, [playerId]: teamLetter } };
      setAssignmentModal(prev => ({ ...prev, match: updatedMatch })); setDoc(doc(db, 'matches', m.id), updatedMatch).catch(console.error);
    }
  };

  const handleUploadPhotos = async (e, matchId) => {
    const files = e.target.files; if (!files || files.length === 0) return; setIsProcessing(true);
    const IMGBB_API_KEY = "c6a6f7f6fae434795cf2eaf848aece24";

    try {
      const match = matches.find(m => m.id === matchId); let newPhotos = [...(match.photos || [])];
      
      if (newPhotos.length + files.length > 30) {
        setSystemAlert({ isOpen: true, message: `쾌적한 앱 사용을 위해 경기당 사진은\n최대 30장까지만 등록할 수 있습니다.\n\n(현재 ${newPhotos.length}장 / 추가 시도 ${files.length}장)` });
        setIsProcessing(false); e.target.value = ''; return;
      }
      
      for (let i = 0; i < files.length; i++) { 
        const resized = await resizeImage(files[i], 1920, 1920, 0.9); 
        const base64Data = resized.split(',')[1]; 

        const formData = new FormData();
        formData.append('image', base64Data);

        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
          method: 'POST',
          body: formData
        });

        const result = await response.json();
        if (result.success) {
           newPhotos.push({ id: Date.now() + i + Math.floor(Math.random() * 1000), url: result.data.url }); 
        } else {
           throw new Error("ImgBB API 업로드 실패");
        }
      }
      await setDoc(doc(db, 'matches', matchId), { ...match, photos: newPhotos });
    } catch(err) { 
      console.error(err); 
      setSystemAlert({ isOpen: true, message: '서버로 사진을 전송하는 중 오류가 발생했습니다.\n네트워크 상태를 확인해주세요.' }); 
    } finally { 
      setIsProcessing(false); e.target.value = ''; 
    }
  };

  const requestDeletePhoto = (photoId) => {
    setSystemConfirm({ isOpen: true, message: '이 사진을 삭제하시겠습니까?', onConfirm: async () => {
      setIsProcessing(true);
      try {
        const match = matches.find(m => m.id === galleryModal.matchId); const newPhotos = (match.photos || []).filter(p => p.id !== photoId);
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
    if (touchEndX < touchStartX - 50 && galleryModal.currentIndex < (galleryModal.photos||[]).length - 1) setGalleryModal(p => ({ ...p, currentIndex: p.currentIndex + 1 }));
    if (touchEndX > touchStartX + 50 && galleryModal.currentIndex > 0) setGalleryModal(p => ({ ...p, currentIndex: p.currentIndex - 1 }));
  };

  const triggerShare = (data) => {
    setShareModal({ isOpen: true, step: 1, data, file: null, imgUrl: null, isVideo: false });
    setTimeout(async () => {
      const captureTarget = document.getElementById('capture-area-hidden'); if (!captureTarget) return;
      try {
        const html2canvas = await loadHtml2Canvas(); const canvas = await html2canvas(captureTarget, { scale: 3, useCORS: true, backgroundColor: '#0F172A' });
        canvas.toBlob((blob) => { if (!blob) return; const file = new File([blob], 'matchboard_result.png', { type: 'image/png' }); setShareModal(prev => ({ ...prev, step: 2, file, imgUrl: URL.createObjectURL(blob), isVideo: false })); }, 'image/png');
      } catch (err) { setSystemAlert({ isOpen: true, message: '오류가 발생했습니다.' }); setShareModal({ isOpen: false, step: 1, data: null, file: null, imgUrl: null, isVideo: false }); }
    }, 500); 
  };

  const triggerTacticShare = () => {
    if (!boardRef.current) return; setShareModal({ isOpen: true, step: 1, data: null, file: null, imgUrl: null, isVideo: false });
    setTimeout(async () => {
      try {
        const html2canvas = await loadHtml2Canvas(); const canvas = await html2canvas(boardRef.current, { scale: 2, useCORS: true, backgroundColor: '#047857' });
        canvas.toBlob((blob) => { if (!blob) return; const file = new File([blob], 'matchboard_tactic.png', { type: 'image/png' }); const imgUrl = URL.createObjectURL(blob); setShareModal(prev => ({ ...prev, step: 2, file, imgUrl, isVideo: false })); }, 'image/png');
      } catch (err) { setSystemAlert({ isOpen: true, message: '오류가 발생했습니다.' }); setShareModal({ isOpen: false, step: 1, data: null, file: null, imgUrl: null, isVideo: false }); }
    }, 500); 
  };

  const downloadShareFile = () => {
    const file = shareModal.file;
    if (!file || !shareModal.imgUrl) return;
    const a = document.createElement('a');
    a.href = shareModal.imgUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const doActualShare = async () => {
    const file = shareModal.file; if (!file) return;
    const ua = navigator.userAgent || '';
    const isKakaotalk = ua.toLowerCase().includes('kakaotalk');
    if (isKakaotalk) { setSystemAlert({ isOpen: true, message: '🚨 카카오톡 인앱브라우저에서는 파일 다이렉트 전송이 제한됩니다.\n\n💡 방법: 우측 하단/상단 메뉴를 눌러 "다른 브라우저(크롬/Safari 등)로 열기"를 한 뒤 진행해주세요.' }); return; }
    const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(ua);
    if (isMobileDevice && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ title: 'MATCHBOARD', files: [file] });
      } catch (e) {
        if (e.name !== 'AbortError') downloadShareFile();
      }
    } else {
      downloadShareFile();
    }
  };

  const handleGoalSubmit = async (selectedId, teamLetter) => {
    const targetMatchId = goalFlow.matchId || liveMatchId;
    const targetMatch = matches.find(m => m.id === targetMatchId);
    const currentTeamLetter = teamLetter || goalFlow.teamLetter;
    const isExternalOpponent = targetMatch?.matchType === 'external' && currentTeamLetter === 'B';
    const isOpponentDirectGoal = selectedId === 'opponent' || (isExternalOpponent && selectedId === 'mercenary');
    const isOwnGoal = goalFlow.step === 1 && selectedId === null;

    if (goalFlow.step === 1 && !isOpponentDirectGoal && !isOwnGoal) {
      setGoalFlow({ ...goalFlow, step: 2, teamLetter: currentTeamLetter, scorer: selectedId });
      setShowOtherTeams(false);
    } else {
      if(isProcessing) return; setIsProcessing(true);
      const { matchId: gfMatchId, quarter: gfQuarter, teamLetter: gfTeamLetter, scorer: gfScorer, isPK: gfIsPK, remark: gfRemark, isMissingAdd: gfIsMissingAdd } = goalFlow;
      const effectiveTeamLetter = gfTeamLetter || currentTeamLetter;
      const effectiveScorer = isOpponentDirectGoal ? 'opponent' : (isOwnGoal ? null : gfScorer);
      const assistId = (isOpponentDirectGoal || isOwnGoal) ? null : selectedId;
      setGoalFlow({ isOpen: false, step: 1, matchId: null, quarter: null, teamLetter: null, scorer: null, isPK: false, remark: '', isMissingAdd: false }); setShowOtherTeams(false);
      try {
        const quarter = gfQuarter || liveState.currentQuarter;
        let finalScorerId = (effectiveScorer === 'mercenary' || effectiveScorer === 'opponent') ? null : effectiveScorer;
        let finalAssistId = (assistId === 'mercenary' || assistId === 'opponent') ? null : assistId;
        const scorer = players.find(p => p.id === finalScorerId); let finalScorerName = scorer?.name || null;
        if (scorer && targetMatch.teamAssignments && targetMatch.teamAssignments[scorer.id] && targetMatch.teamAssignments[scorer.id] !== effectiveTeamLetter) finalScorerName = `(${targetMatch.teamAssignments[scorer.id]}팀) ${scorer.name}`;
        if (effectiveScorer === 'mercenary') finalScorerName = '용병';
        if (effectiveScorer === 'opponent') finalScorerName = getTeamDisplayName(targetMatch, effectiveTeamLetter);
        if (!effectiveScorer) finalScorerName = '상대팀'; 
        const assist = players.find(p => p.id === finalAssistId); let finalAssistName = assist?.name || null;
        if (assist && targetMatch.teamAssignments && targetMatch.teamAssignments[assist.id] && targetMatch.teamAssignments[assist.id] !== effectiveTeamLetter) finalAssistName = `(${targetMatch.teamAssignments[assist.id]}팀) ${assist.name}`;
        if (assistId === 'mercenary') finalAssistName = '용병';
        const newLog = { id: Date.now(), quarter, teamLetter: effectiveTeamLetter, scorerId: finalScorerId, scorerName: finalScorerName, assistId: finalAssistId, assistName: finalAssistName, time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute:'2-digit' }), isPK: gfIsPK, remark: gfRemark };
        const newLogs = [...(targetMatch.logs || []), newLog]; const newScores = { ...(targetMatch.scores || {}), [effectiveTeamLetter]: ((targetMatch.scores || {})[effectiveTeamLetter] || 0) + 1 };
        let newQuarterScores = [...(targetMatch.quarterScores || [])];
        if (gfIsMissingAdd) { const qsIndex = newQuarterScores.findIndex(qs => qs.quarter === quarter); if (qsIndex > -1) { const qs = newQuarterScores[qsIndex]; const isTeam1 = qs.team1 === effectiveTeamLetter; newQuarterScores[qsIndex] = { ...qs, score1: isTeam1 ? qs.score1 + 1 : qs.score1, score2: !isTeam1 ? qs.score2 + 1 : qs.score2 }; } }
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
      const fd = new FormData(e.target);
      const rawScorerId = fd.get('scorerId');
      const rawAssistId = fd.get('assistId');
      const newScorerId = (!rawScorerId || rawScorerId === 'none') ? null : rawScorerId;
      const newAssistId = (!rawAssistId || rawAssistId === 'none' || newScorerId === 'opponent') ? null : rawAssistId;
      const newIsPK = fd.get('isPK') === 'true' || fd.get('isPK') === 'on'; const newRemark = fd.get('remark') || '';
      const m = matches.find(match => match.id === logEditModal.match.id); const l = logEditModal.log;
      const oldScorerId = l.scorerId; const oldAssistId = l.assistId; const updatePromises = [];
      if (oldScorerId !== newScorerId) {
          if (oldScorerId && oldScorerId !== 'mercenary' && oldScorerId !== 'opponent') { const p = players.find(p => p.id === oldScorerId); if (p) updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, goals: Math.max(0, (p.goals || 0) - 1) })); }
          if (newScorerId && newScorerId !== 'mercenary' && newScorerId !== 'opponent') { const p = players.find(p => p.id === newScorerId); if (p) updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, goals: (p.goals || 0) + 1 })); }
      }
      if (oldAssistId !== newAssistId) {
          if (oldAssistId && oldAssistId !== 'mercenary' && oldAssistId !== 'opponent') { const p = players.find(p => p.id === oldAssistId); if (p) updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, assists: Math.max(0, (p.assists || 0) - 1) })); }
          if (newAssistId && newAssistId !== 'mercenary' && newAssistId !== 'opponent') { const p = players.find(p => p.id === newAssistId); if (p) updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, assists: (p.assists || 0) + 1 })); }
      }
      const scorer = players.find(p => p.id === newScorerId); let finalScorerName = l.scorerName;
      if (newScorerId === 'mercenary') finalScorerName = '용병';
      else if (newScorerId === 'opponent') finalScorerName = getTeamDisplayName(m, l.teamLetter);
      else if (newScorerId === null) finalScorerName = '상대팀';
      else if (scorer) { finalScorerName = scorer.name; if (m.teamAssignments && m.teamAssignments[scorer.id] && m.teamAssignments[scorer.id] !== l.teamLetter) finalScorerName = `(${m.teamAssignments[scorer.id]}팀) ${scorer.name}`; }
      const assist = players.find(p => p.id === newAssistId); let finalAssistName = l.assistName;
      if (newAssistId === 'mercenary') finalAssistName = '용병';
      else if (assist) { finalAssistName = assist.name; if (m.teamAssignments && m.teamAssignments[assist.id] && m.teamAssignments[assist.id] !== l.teamLetter) finalAssistName = `(${m.teamAssignments[assist.id]}팀) ${assist.name}`; } 
      else if (newAssistId === null) { finalAssistName = null; }
      const updatedLogs = (m.logs || []).map(log => log.id === l.id ? { ...log, scorerId: (newScorerId === 'mercenary' || newScorerId === 'opponent') ? null : newScorerId, scorerName: finalScorerName, assistId: (newAssistId === 'mercenary' || newAssistId === 'opponent') ? null : newAssistId, assistName: finalAssistName, isPK: newIsPK, remark: newRemark } : log);
      updatePromises.push(setDoc(doc(db, 'matches', m.id), { ...m, logs: updatedLogs }));
      await Promise.all(updatePromises);
      setLogEditModal({ isOpen: false, match: null, log: null }); setSystemAlert({ isOpen: true, message: '득점 기록이 수정되었습니다.' });
    } finally { setIsProcessing(false); }
  };

  const handleQuarterEditSave = async (e) => {
    e.preventDefault(); if(isProcessing) return; setIsProcessing(true);
    try {
      const fd = new FormData(e.target); const newTeam1 = fd.get('team1'); const newTeam2 = fd.get('team2');
      const rawGk1 = fd.get('gk1'); const rawGk2 = fd.get('gk2');
      const newGk1 = (!rawGk1 || rawGk1 === 'none') ? null : rawGk1;
      const newGk2 = (!rawGk2 || rawGk2 === 'none') ? null : rawGk2;
      if (newTeam1 === newTeam2) { setSystemAlert({ isOpen: true, message: '서로 다른 팀을 선택해주세요.' }); setIsProcessing(false); return; }
      const m = matches.find(match => match.id === quarterEditModal.match.id); const qs = quarterEditModal.quarterScore;
      const oldTeam1 = qs.team1; const oldTeam2 = qs.team2;
      let updatedLogs = [...(m.logs || [])]; let updatedScores = { ...(m.scores || {}) };
      if (newTeam1 !== oldTeam1 || newTeam2 !== oldTeam2) {
        updatedLogs = updatedLogs.map(log => {
          if (log.quarter === qs.quarter) {
            if (log.teamLetter === oldTeam1) { updatedScores[oldTeam1] = Math.max(0, (updatedScores[oldTeam1] || 0) - 1); updatedScores[newTeam1] = (updatedScores[newTeam1] || 0) + 1; return { ...log, teamLetter: newTeam1 }; }
            if (log.teamLetter === oldTeam2) { updatedScores[oldTeam2] = Math.max(0, (updatedScores[oldTeam2] || 0) - 1); updatedScores[newTeam2] = (updatedScores[newTeam2] || 0) + 1; return { ...log, teamLetter: newTeam2 }; }
          }
          return log;
        });
      }
      const updatedQuarterScores = (m.quarterScores || []).map(q => q.quarter === qs.quarter ? { ...q, team1: newTeam1, team2: newTeam2, gk1: newGk1, gk2: newGk2 } : q);
      await setDoc(doc(db, 'matches', m.id), { ...m, logs: updatedLogs, scores: updatedScores, quarterScores: updatedQuarterScores });
      setQuarterEditModal({ isOpen: false, match: null, quarterScore: null }); setSystemAlert({ isOpen: true, message: '쿼터 정보가 수정되었습니다.' });
    } finally { setIsProcessing(false); }
  };

  const handleQuarterDelete = async () => {
    const m = matches.find(match => match.id === quarterEditModal.match.id); const qs = quarterEditModal.quarterScore;
    setSystemConfirm({ isOpen: true, message: `정말 이 쿼터를 미진행(조기종료) 처리하시겠습니까?\n이 쿼터에 기록된 모든 득점/도움 기록이 회수됩니다.`, onConfirm: async () => {
      if(isProcessing) return; setIsProcessing(true);
      try {
        const logsToDelete = (m.logs || []).filter(l => l.quarter === qs.quarter); const updatePromises = []; let updatedScores = { ...(m.scores || {}) };
        logsToDelete.forEach(l => {
          if (l.scorerId) { const p = players.find(p => p.id === l.scorerId); if (p) updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, goals: Math.max(0, (p.goals || 0) - 1) })); }
          if (l.assistId) { const p = players.find(p => p.id === l.assistId); if (p) updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, assists: Math.max(0, (p.assists || 0) - 1) })); }
          if (updatedScores[l.teamLetter] !== undefined) updatedScores[l.teamLetter] = Math.max(0, updatedScores[l.teamLetter] - 1);
        });
        const updatedLogs = (m.logs || []).filter(l => l.quarter !== qs.quarter); const updatedQuarterScores = (m.quarterScores || []).filter(q => q.quarter !== qs.quarter);
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
        const newQuarterScore = { quarter: liveState.currentQuarter, team1: t1, team2: t2, score1: qScore1, score2: qScore2, gk1: liveState.gk1 || null, gk2: liveState.gk2 || null };
        updatedMatch = { ...updatedMatch, quarterScores: [...(liveMatch.quarterScores || []), newQuarterScore] };
      }
      if (isEarlyEnd || liveState.currentQuarter >= liveMatch.totalQuarters) {
         const updatePromises = [];
         for (const p of players) { if ((updatedMatch.attendees || []).includes(p.id)) { updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, caps: (p.caps || 0) + 1 })); } }
         updatePromises.push(setDoc(doc(db, 'matches', liveMatchId), { ...updatedMatch, status: 'completed', liveStatus: null }));
         await Promise.all(updatePromises); setAppState('main'); setLiveMatchId(null);
      } else {
         const nextQ = liveState.currentQuarter + 1; const stats = updatedMatch.isTournament ? calculateTournamentStandings(updatedMatch) : null;
         const nextTeams = updatedMatch.isTournament ? getTournamentMatchup(nextQ, updatedMatch, stats) : ['A', 'B'];
         const nextGk1 = getLastGkForTeam(updatedMatch, nextTeams[0]);
         const nextGk2 = updatedMatch.matchType === 'external' ? null : getLastGkForTeam(updatedMatch, nextTeams[1]);
         const nextLiveStatus = { currentQuarter: nextQ, playingTeams: nextTeams, isQuarterActive: false, gk1: nextGk1, gk2: nextGk2, updatedAt: Date.now() };
         await setDoc(doc(db, 'matches', liveMatchId), { ...updatedMatch, liveStatus: nextLiveStatus });
         setLiveState({ currentQuarter: nextQ, playingTeams: nextTeams, isQuarterActive: false, gk1: nextGk1, gk2: nextGk2 });
      }
    } finally { setIsProcessing(false); }
  };

  const saveHistory = (newTokens, newDrawings = drawings) => {
    setPastState(prev => [...prev, { tokens: tacticTokens || [], drawings: drawings || [] }].slice(-20)); setFutureState([]);
    setTacticTokens(newTokens || []); if(newDrawings) setDrawings(newDrawings || []);
    if (isAutoRecording) setAnimationFrames(prev => [...prev, { tokens: JSON.parse(JSON.stringify(newTokens || [])), drawings: JSON.parse(JSON.stringify(newDrawings || [])) }]);
  };

  const handleBoardPointerDown = (e) => {
    if (currentTool === 'move' || isPlaying) return;
    const rect = boardRef.current.getBoundingClientRect(); const x = ((e.clientX - rect.left) / rect.width) * 100; const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (currentTool === 'arrow' || currentTool === 'pass' || currentTool === 'zone') {
       if (currentTool === 'arrow' && svgArrowRef.current) { svgArrowRef.current.style.display = 'block'; svgArrowRef.current.setAttribute('x1', `${x}%`); svgArrowRef.current.setAttribute('y1', `${y}%`); svgArrowRef.current.setAttribute('x2', `${x}%`); svgArrowRef.current.setAttribute('y2', `${y}%`); }
       if (currentTool === 'pass' && svgPassRef.current) { svgPassRef.current.style.display = 'block'; svgPassRef.current.setAttribute('x1', `${x}%`); svgPassRef.current.setAttribute('y1', `${y}%`); svgPassRef.current.setAttribute('x2', `${x}%`); svgPassRef.current.setAttribute('y2', `${y}%`); }
       if (currentTool === 'zone' && svgZoneRef.current) { svgZoneRef.current.style.display = 'block'; svgZoneRef.current.setAttribute('x', `${x}%`); svgZoneRef.current.setAttribute('y', `${y}%`); svgZoneRef.current.setAttribute('width', `0%`); svgZoneRef.current.setAttribute('height', `0%`); }
       activeDrawingData.current = { id: Date.now(), type: currentTool, start: {x, y}, end: {x, y} };
    }
  };

  const handleBoardPointerMove = (e) => {
    if (!boardRef.current || isPlaying) return;
    const rect = boardRef.current.getBoundingClientRect(); let x = ((e.clientX - rect.left) / rect.width) * 100; let y = ((e.clientY - rect.top) / rect.height) * 100;
    x = Math.max(0, Math.min(100, x)); y = Math.max(0, Math.min(100, y));
    if (currentTool === 'move' && draggingToken) {
      const el = document.getElementById(`token-${draggingToken}`); if (el) { el.style.left = `${x}%`; el.style.top = `${y}%`; } 
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
         const x = parseFloat(el.style.left); const y = parseFloat(el.style.top); const downInfo = pointerDownInfo.current; const dist = Math.sqrt(Math.pow(e.clientX - downInfo.x, 2) + Math.pow(e.clientY - downInfo.y, 2));
         if (dist < 5 && (Date.now() - downInfo.time) < 250) {
            if (draggingToken !== 'ball') setTokenEditModal({ isOpen: true, token: (tacticTokens||[]).find(t => t.id === draggingToken) });
            const orig = (dragStartTokensRef.current||[]).find(t => t.id === draggingToken); if (orig) { el.style.left = `${orig.x}%`; el.style.top = `${orig.y}%`; }
         } else { const newTokens = (tacticTokens||[]).map(t => t.id === draggingToken ? { ...t, x, y } : t); saveHistory(newTokens); }
      }
      setDraggingToken(null);
    } else if (activeDrawingData.current) {
      const dist = Math.sqrt(Math.pow(activeDrawingData.current.start.x - activeDrawingData.current.end.x, 2) + Math.pow(activeDrawingData.current.start.y - activeDrawingData.current.end.y, 2));
      if (dist > 2) { const newDrawings = [...(drawings||[]), activeDrawingData.current]; saveHistory(tacticTokens||[], newDrawings); }
      activeDrawingData.current = null;
      if (svgArrowRef.current) svgArrowRef.current.style.display = 'none'; if (svgPassRef.current) svgPassRef.current.style.display = 'none'; if (svgZoneRef.current) svgZoneRef.current.style.display = 'none';
    }
  };

  const handleUpdatePlayerCount = (teamLetter, newCount) => {
    if (newCount < 0) newCount = 0; if (newCount > 30) newCount = 30;
    const teamTokens = (tacticTokens||[]).filter(t => t.team === teamLetter); const otherTokens = (tacticTokens||[]).filter(t => t.team !== teamLetter); const currentCount = teamTokens.length;
    if (newCount === currentCount) return; let newTeamTokens = [...teamTokens];
    if (newCount > currentCount) { const toAdd = newCount - currentCount; for (let i = 0; i < toAdd; i++) { const yPos = pitchType === 'full' ? (teamLetter === 'A' ? 80 : 20) : (teamLetter === 'A' ? 65 : 35); newTeamTokens.push({ id: `${teamLetter}_${Date.now()}_${i}`, position: 'CM', name: '', x: 50, y: yPos, team: teamLetter }); } } 
    else { newTeamTokens.splice(newTeamTokens.length - (currentCount - newCount), currentCount - newCount); }
    saveHistory([...otherTokens, ...newTeamTokens]);
  };

  const exportAnimationToVideo = async () => {
    if ((animationFrames||[]).length < 2) return; setShareModal({ isOpen: true, step: 1, data: null, file: null, imgUrl: null, isVideo: true });
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = pitchType === 'full' ? 900 : 450; const ctx = canvas.getContext('2d');
    const candidateTypes = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const mimeType = (typeof MediaRecorder !== 'undefined' && candidateTypes.find(t => MediaRecorder.isTypeSupported(t))) || 'video/webm';
    try {
      const stream = canvas.captureStream(30); const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 }); const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => { const isMp4 = mimeType.includes('mp4'); const ext = isMp4 ? 'mp4' : 'webm'; const cleanMime = isMp4 ? 'video/mp4' : 'video/webm'; const blob = new Blob(chunks, { type: cleanMime }); const file = new File([blob], `tactic_animation.${ext}`, { type: cleanMime }); const url = URL.createObjectURL(blob); setShareModal(prev => ({ ...prev, step: 2, file, imgUrl: url, isVideo: true })); };
      ctx.fillStyle = '#047857'; ctx.fillRect(0, 0, canvas.width, canvas.height); recorder.start();
      let frameIdx = 0; let progress = 0; const fps = 30; const stepsPerFrame = fps * 0.5; 
      const draw = () => {
          ctx.fillStyle = '#047857'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 4;
          if (pitchType === 'full') {
            ctx.beginPath(); ctx.moveTo(0, canvas.height/2); ctx.lineTo(canvas.width, canvas.height/2); ctx.stroke();
            ctx.beginPath(); ctx.arc(canvas.width/2, canvas.height/2, 60, 0, Math.PI*2); ctx.stroke();
            ctx.strokeRect(canvas.width * 0.2, 0, canvas.width * 0.6, canvas.height * 0.16);
            ctx.strokeRect(canvas.width * 0.2, canvas.height * 0.84, canvas.width * 0.6, canvas.height * 0.16);
          } else {
            ctx.strokeRect(canvas.width * 0.2, 0, canvas.width * 0.6, canvas.height * 0.33);
            ctx.strokeRect(canvas.width * 0.35, 0, canvas.width * 0.3, canvas.height * 0.12);
            ctx.beginPath(); ctx.arc(canvas.width/2, canvas.height, 70, Math.PI, 0); ctx.stroke();
          }
          const currentFrame = animationFrames[frameIdx]; const nextFrame = animationFrames[Math.min(frameIdx + 1, animationFrames.length - 1)];
          currentFrame.drawings.forEach(d => {
              if(d.type === 'arrow' || d.type === 'pass') {
                const x1 = (d.start.x/100)*canvas.width; const y1 = (d.start.y/100)*canvas.height;
                const x2 = (d.end.x/100)*canvas.width; const y2 = (d.end.y/100)*canvas.height;
                const color = d.type === 'arrow' ? '#FACC15' : '#38BDF8';
                ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 4;
                if(d.type==='pass') ctx.setLineDash([10, 8]); else ctx.setLineDash([]);
                ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
                const angle = Math.atan2(y2 - y1, x2 - x1); const headLen = 14;
                ctx.beginPath(); ctx.moveTo(x2, y2);
                ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
                ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
                ctx.closePath(); ctx.fill();
              } 
              else if(d.type === 'zone') { ctx.fillStyle = 'rgba(59, 130, 246, 0.3)'; ctx.strokeStyle = '#3B82F6'; ctx.lineWidth = 3; const x = Math.min(d.start.x, d.end.x)/100 * canvas.width; const y = Math.min(d.start.y, d.end.y)/100 * canvas.height; const w = Math.abs(d.start.x - d.end.x)/100 * canvas.width; const h = Math.abs(d.start.y - d.end.y)/100 * canvas.height; ctx.fillRect(x,y,w,h); ctx.strokeRect(x,y,w,h); }
          });
          currentFrame.tokens.forEach(t1 => {
              const t2 = nextFrame.tokens.find(t => t.id === t1.id) || t1; const t = progress / stepsPerFrame; const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
              const x = t1.x + (t2.x - t1.x) * ease; const y = t1.y + (t2.y - t1.y) * ease; const px = (x / 100) * canvas.width; const py = (y / 100) * canvas.height;
              if(t1.team === 'ball') { ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = '#000000'; ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⚽', px, py); } 
              else {
                  ctx.fillStyle = t1.team === 'A' ? '#DC2626' : '#2563EB'; ctx.beginPath(); ctx.arc(px, py, 22, 0, Math.PI*2); ctx.fill(); ctx.strokeStyle = t1.team === 'A' ? '#991B1B' : '#1E40AF'; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t1.position || '', px, py);
                  if (t1.name) { ctx.font = 'bold 12px sans-serif'; const textWidth = ctx.measureText(t1.name).width; const rectWidth = textWidth + 16; const rectHeight = 20; const rectY = py + 32; ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(px - rectWidth/2, rectY - rectHeight/2, rectWidth, rectHeight, 10); else ctx.rect(px - rectWidth/2, rectY - rectHeight/2, rectWidth, rectHeight); ctx.fill(); ctx.fillStyle = '#FFFFFF'; ctx.fillText(t1.name, px, rectY); }
              }
          });
          progress++; if (progress > stepsPerFrame) { progress = 0; frameIdx++; }
          if (frameIdx < animationFrames.length - 1 || (frameIdx === animationFrames.length - 1 && progress < fps * 0.5)) { setTimeout(draw, 1000 / fps); } else { setTimeout(() => recorder.stop(), 200); }
      };
      setTimeout(draw, 100);
    } catch(e) { setSystemAlert({ isOpen: true, message: '비디오 추출을 지원하지 않는 브라우저입니다.\n캡처 버튼을 이용해주세요.' }); setShareModal({ isOpen: false, step: 1, data: null, file: null, imgUrl: null, isVideo: false }); }
  };

  // ================= GPS 분석 및 스마트워치 히트맵 엔진 =================
  const savedGpsRecords = useMemo(() => {
    const raw = memos?.['__gps_records__'];
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [memos]);

  const calcHaversineMeters = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const toRad = d => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const formatDurationKo = (sec) => {
    const total = Math.max(0, Math.round(sec || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}분 ${String(s).padStart(2, '0')}초`;
  };

  const analyzeGpsPoints = (rawPoints, title = '워치 GPS 기록') => {
    if (!rawPoints || rawPoints.length < 5) {
      setSystemAlert({ isOpen: true, message: '유효한 GPS 위치 포인트가 부족합니다.\n야외에서 측정된 운동 파일인지 확인해주세요.' });
      return null;
    }

    // 1. 시간순 정렬 및 기본 필터링
    const pts = rawPoints
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map((p, idx) => ({
        lat: p.lat,
        lon: p.lon,
        timeMs: p.timeMs || (Date.now() + idx * 1000),
        hr: p.hr && p.hr > 30 && p.hr < 240 ? p.hr : null
      }))
      .sort((a, b) => a.timeMs - b.timeMs);

    if (pts.length < 5) return null;

    // 2. 구간 거리 및 순간 속도 계산 + 노이즈 제거
    let totalDistM = 0;
    const enriched = [{ ...pts[0], distM: 0, dtSec: 0, rawSpeedKmh: 0, elapsedSec: 0 }];
    const startTimeMs = pts[0].timeMs;

    for (let i = 1; i < pts.length; i++) {
      const prev = enriched[enriched.length - 1];
      const cur = pts[i];
      let dtSec = (cur.timeMs - prev.timeMs) / 1000;
      if (dtSec <= 0) dtSec = 1;
      const distM = calcHaversineMeters(prev.lat, prev.lon, cur.lat, cur.lon);
      const speedKmh = (distM / dtSec) * 3.6;

      // GPS 튐(순간이동 > 40km/h) 제거
      if (speedKmh > 40 && dtSec < 10) continue;

      // 제자리 미세 흔들림 보정
      const effectiveDist = (distM < 0.6 && speedKmh < 1.3) ? 0 : distM;
      totalDistM += effectiveDist;

      enriched.push({
        ...cur,
        distM: effectiveDist,
        dtSec,
        rawSpeedKmh: effectiveDist > 0 ? speedKmh : 0,
        elapsedSec: Math.max(0, (cur.timeMs - startTimeMs) / 1000)
      });
    }

    // 3. 3포인트 이동평균 속도 스무딩 (손목 스윙 노이즈 완화)
    let maxSpeedKmh = 0;
    let zoneWalkSec = 0, zoneJogSec = 0, zoneRunSec = 0, zoneSprintSec = 0;
    let sprintCount = 0;
    let sprintDistanceM = 0;
    let inSprint = false;
    let sprintDurationAcc = 0;

    enriched.forEach((p, idx) => {
      const s0 = enriched[Math.max(0, idx - 1)].rawSpeedKmh;
      const s1 = p.rawSpeedKmh;
      const s2 = enriched[Math.min(enriched.length - 1, idx + 1)].rawSpeedKmh;
      const smoothSpeed = Math.min(36, (s0 + s1 * 2 + s2) / 4);
      p.speed = Number(smoothSpeed.toFixed(1));
      if (p.speed > maxSpeedKmh) maxSpeedKmh = p.speed;

      const dt = Math.min(p.dtSec || 1, 10);
      if (p.speed < 7) zoneWalkSec += dt;
      else if (p.speed < 14) zoneJogSec += dt;
      else if (p.speed < 20) zoneRunSec += dt;
      else {
        zoneSprintSec += dt;
        sprintDistanceM += p.distM || 0;
      }

      if (p.speed >= 19.5) {
        sprintDurationAcc += dt;
        if (!inSprint && sprintDurationAcc >= 1.5) {
          inSprint = true;
          sprintCount++;
        }
      } else {
        inSprint = false;
        sprintDurationAcc = 0;
      }
    });

    // 4. 위도/경도를 로컬 미터 좌표(mx, my)로 변환 후 주성분(PCA) 회전으로 경기장 축 자동 정렬
    const meanLat = enriched.reduce((s, p) => s + p.lat, 0) / enriched.length;
    const meanLon = enriched.reduce((s, p) => s + p.lon, 0) / enriched.length;
    const cosLat = Math.cos((meanLat * Math.PI) / 180);

    const meterPts = enriched.map(p => ({
      mx: (p.lon - meanLon) * 111320 * cosLat,
      my: (p.lat - meanLat) * 110540
    }));

    let covXX = 0, covYY = 0, covXY = 0;
    meterPts.forEach(m => {
      covXX += m.mx * m.mx;
      covYY += m.my * m.my;
      covXY += m.mx * m.my;
    });
    // 가장 긴 활동 축이 세로(Y축)가 되도록 회전각 계산
    const theta = 0.5 * Math.atan2(2 * covXY, covXX - covYY);
    const rotAngle = Math.PI / 2 - theta;
    const cosR = Math.cos(rotAngle);
    const sinR = Math.sin(rotAngle);

    const rotated = meterPts.map(m => ({
      rx: m.mx * cosR - m.my * sinR,
      ry: m.mx * sinR + m.my * cosR
    }));

    // 상하좌우 2% 극단치 제외한 바운딩 박스로 2D 피치(6~94%) 매핑
    const sortedX = [...rotated.map(r => r.rx)].sort((a, b) => a - b);
    const sortedY = [...rotated.map(r => r.ry)].sort((a, b) => a - b);
    const pLow = Math.floor(rotated.length * 0.02);
    const pHigh = Math.max(pLow + 1, Math.ceil(rotated.length * 0.98) - 1);
    const minX = sortedX[pLow], maxX = sortedX[pHigh];
    const minY = sortedY[pLow], maxY = sortedY[pHigh];
    const spanX = Math.max(15, maxX - minX);
    const spanY = Math.max(25, maxY - minY);

    const normalizedAll = enriched.map((p, i) => {
      const nx = Math.max(5, Math.min(95, 6 + ((rotated[i].rx - minX) / spanX) * 88));
      const ny = Math.max(5, Math.min(95, 6 + (1 - (rotated[i].ry - minY) / spanY) * 88));
      return {
        x: Number(nx.toFixed(1)),
        y: Number(ny.toFixed(1)),
        speed: p.speed,
        t: Math.round(p.elapsedSec),
        hr: p.hr
      };
    });

    // 리플레이/저장용 최대 220포인트 균등 샘플링 (스프린트 피크 보존)
    const maxSample = 220;
    let sampledPoints = normalizedAll;
    if (normalizedAll.length > maxSample) {
      const step = (normalizedAll.length - 1) / (maxSample - 1);
      sampledPoints = [];
      for (let i = 0; i < maxSample; i++) {
        const idx = Math.round(i * step);
        sampledPoints.push(normalizedAll[idx]);
      }
    }

    const durationSec = Math.max(1, (enriched[enriched.length - 1].timeMs - enriched[0].timeMs) / 1000);
    const totalDistanceKm = Number((totalDistM / 1000).toFixed(2));
    const avgSpeedKmh = Number(((totalDistM / durationSec) * 3.6).toFixed(1));
    const hrs = enriched.map(p => p.hr).filter(Boolean);
    const avgHr = hrs.length > 0 ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;
    const maxHr = hrs.length > 0 ? Math.max(...hrs) : null;
    const totalZoneSec = Math.max(1, zoneWalkSec + zoneJogSec + zoneRunSec + zoneSprintSec);
    const zones = {
      walk: Math.round((zoneWalkSec / totalZoneSec) * 100),
      jog: Math.round((zoneJogSec / totalZoneSec) * 100),
      run: Math.round((zoneRunSec / totalZoneSec) * 100),
      sprint: Math.max(0, 100 - Math.round((zoneWalkSec / totalZoneSec) * 100) - Math.round((zoneJogSec / totalZoneSec) * 100) - Math.round((zoneRunSec / totalZoneSec) * 100))
    };
    const calories = Math.round(totalDistanceKm * 68 + (sprintCount * 4));
    const activityScore = Math.min(99, Math.max(55, Math.round(60 + totalDistanceKm * 6 + sprintCount * 1.5 + (maxSpeedKmh > 22 ? 6 : 0))));
    const recordedDate = new Date(pts[0].timeMs).toISOString().split('T')[0];

    return {
      id: 'gps_' + Date.now(),
      title,
      date: recordedDate,
      totalDistanceKm,
      durationSec: Math.round(durationSec),
      maxSpeedKmh: Number(maxSpeedKmh.toFixed(1)),
      avgSpeedKmh,
      sprintCount,
      sprintDistanceM: Math.round(sprintDistanceM),
      avgHr,
      maxHr,
      calories,
      zones,
      activityScore,
      points: sampledPoints
    };
  };

  const handleGpsFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, 'text/xml');
      const rawPoints = [];

      // 1. GPX 포맷 (<trkpt>, <rtept>)
      const trkpts = Array.from(xml.querySelectorAll('trkpt, rtept'));
      if (trkpts.length > 0) {
        trkpts.forEach((pt, idx) => {
          const lat = parseFloat(pt.getAttribute('lat'));
          const lon = parseFloat(pt.getAttribute('lon'));
          const timeNode = pt.querySelector('time');
          const timeMs = timeNode ? new Date(timeNode.textContent).getTime() : (Date.now() + idx * 1000);
          const hrNode = pt.getElementsByTagName('gpxtpx:hr')[0] || pt.getElementsByTagName('ns3:hr')[0] || pt.querySelector('hr');
          const hr = hrNode ? parseInt(hrNode.textContent, 10) : null;
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            rawPoints.push({ lat, lon, timeMs, hr });
          }
        });
      }

      // 2. TCX 포맷 (<Trackpoint>)
      if (rawPoints.length === 0) {
        const tcxPts = Array.from(xml.querySelectorAll('Trackpoint'));
        tcxPts.forEach((pt, idx) => {
          const latNode = pt.querySelector('Position > LatitudeDegrees') || pt.getElementsByTagName('LatitudeDegrees')[0];
          const lonNode = pt.querySelector('Position > LongitudeDegrees') || pt.getElementsByTagName('LongitudeDegrees')[0];
          const timeNode = pt.querySelector('Time') || pt.getElementsByTagName('Time')[0];
          const hrNode = pt.querySelector('HeartRateBpm > Value') || pt.getElementsByTagName('Value')[0];
          if (latNode && lonNode) {
            const lat = parseFloat(latNode.textContent);
            const lon = parseFloat(lonNode.textContent);
            const timeMs = timeNode ? new Date(timeNode.textContent).getTime() : (Date.now() + idx * 1000);
            const hr = hrNode ? parseInt(hrNode.textContent, 10) : null;
            if (Number.isFinite(lat) && Number.isFinite(lon)) {
              rawPoints.push({ lat, lon, timeMs, hr });
            }
          }
        });
      }

      if (rawPoints.length < 5) {
        setSystemAlert({ isOpen: true, message: '파일에서 GPS 경로 데이터를 찾을 수 없습니다.\nGPX 또는 TCX 파일인지 확인해주세요.' });
        e.target.value = '';
        return;
      }

      const cleanName = file.name.replace(/\.(gpx|tcx|xml)$/i, '');
      const analyzed = analyzeGpsPoints(rawPoints, cleanName);
      if (analyzed) {
        setGpsSession(analyzed);
        setGpsFlipVertical(false);
        setGpsRotate90(false);
        setGpsReplayPlaying(false);
        setGpsReplayProgress(0);
      }
    } catch (err) {
      console.error(err);
      setSystemAlert({ isOpen: true, message: 'GPS 파일을 읽는 중 오류가 발생했습니다.' });
    } finally {
      e.target.value = '';
    }
  };

  const loadSampleGpsSession = () => {
    // 실제 축구 1쿼터(25분) 미드필더/윙어 움직임을 모사한 정교한 샘플 시뮬레이션
    const baseLat = 37.5665;
    const baseLon = 126.9780;
    const rawPoints = [];
    const startMs = Date.now() - 25 * 60 * 1000;
    let curX = 0; // -28m ~ +28m
    let curY = -10; // -46m ~ +46m
    let vx = 0, vy = 0;

    // 주요 활동 거점 (중앙 미드필더 + 우측 윙 오버래핑 패턴)
    const hotspots = [
      { x: 8, y: -5 }, { x: 18, y: 18 }, { x: 22, y: 34 },
      { x: -6, y: 8 }, { x: 12, y: -22 }, { x: 0, y: 28 },
      { x: -16, y: -12 }, { x: 15, y: 10 }
    ];

    for (let sec = 0; sec <= 1500; sec += 2) {
      const target = hotspots[Math.floor((sec / 90) % hotspots.length)];
      const isSprintBurst = (sec % 170 >= 20 && sec % 170 <= 30) || (sec % 230 >= 50 && sec % 230 <= 58);
      const pull = isSprintBurst ? 0.22 : 0.07;
      vx = vx * 0.65 + (target.x - curX) * pull + (Math.sin(sec * 0.17) * 1.9);
      vy = vy * 0.65 + (target.y - curY) * pull + (Math.cos(sec * 0.13) * 2.4);

      const stepDist = Math.hypot(vx, vy);
      const maxStep = isSprintBurst ? 13.8 : 6.2; // 2초당 이동거리 (최대 약 25~27km/h)
      if (stepDist > maxStep) {
        vx = (vx / stepDist) * maxStep;
        vy = (vy / stepDist) * maxStep;
      }

      curX = Math.max(-29, Math.min(29, curX + vx * 0.45));
      curY = Math.max(-46, Math.min(46, curY + vy * 0.45));

      const lat = baseLat + curY / 110540;
      const lon = baseLon + curX / (111320 * Math.cos((baseLat * Math.PI) / 180));
      const hr = Math.round(138 + (isSprintBurst ? 36 : 14) + Math.sin(sec * 0.03) * 8);
      rawPoints.push({ lat, lon, timeMs: startMs + sec * 1000, hr });
    }

    const analyzed = analyzeGpsPoints(rawPoints, '샘플 워치 기록 (25분 쿼터)');
    if (analyzed) {
      setGpsSession(analyzed);
      setGpsFlipVertical(false);
      setGpsRotate90(false);
      setGpsReplayPlaying(false);
      setGpsReplayProgress(0);
    }
  };

  const startLiveSmartphoneGps = async () => {
    if (!navigator.geolocation) {
      setSystemAlert({ isOpen: true, message: '이 브라우저에서는 GPS 위치 측정을 지원하지 않습니다.' });
      return;
    }
    liveGpsPointsRef.current = [];
    setLiveGpsStats({ elapsedSec: 0, distanceKm: 0, currentSpeedKmh: 0, maxSpeedKmh: 0, pointCount: 0 });
    setIsLiveGpsTracking(true);

    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch {}

    const startMs = Date.now();
    liveGpsTimerRef.current = setInterval(() => {
      setLiveGpsStats(prev => ({ ...prev, elapsedSec: Math.floor((Date.now() - startMs) / 1000) }));
    }, 1000);

    liveGpsWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lon, speed } = pos.coords;
        const nowMs = Date.now();
        const pts = liveGpsPointsRef.current;
        let addDistKm = 0;
        let calcSpeedKmh = Number.isFinite(speed) && speed >= 0 ? speed * 3.6 : 0;

        if (pts.length > 0) {
          const last = pts[pts.length - 1];
          const dMeters = calcHaversineMeters(last.lat, last.lon, lat, lon);
          const dtSec = Math.max(1, (nowMs - last.timeMs) / 1000);
          if (!calcSpeedKmh) calcSpeedKmh = (dMeters / dtSec) * 3.6;
          if (dMeters >= 0.8 && calcSpeedKmh < 40) {
            addDistKm = dMeters / 1000;
          }
        }

        pts.push({ lat, lon, timeMs: nowMs, hr: null });
        setLiveGpsStats(prev => ({
          ...prev,
          distanceKm: Number((prev.distanceKm + addDistKm).toFixed(2)),
          currentSpeedKmh: Number(Math.min(36, calcSpeedKmh).toFixed(1)),
          maxSpeedKmh: Number(Math.max(prev.maxSpeedKmh, Math.min(36, calcSpeedKmh)).toFixed(1)),
          pointCount: pts.length
        }));
      },
      (err) => {
        console.warn('GPS watch error:', err);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  };

  const stopLiveSmartphoneGps = () => {
    if (liveGpsWatchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(liveGpsWatchIdRef.current);
      liveGpsWatchIdRef.current = null;
    }
    if (liveGpsTimerRef.current) {
      clearInterval(liveGpsTimerRef.current);
      liveGpsTimerRef.current = null;
    }
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
    setIsLiveGpsTracking(false);

    const pts = liveGpsPointsRef.current;
    if (pts.length < 5) {
      setSystemAlert({ isOpen: true, message: `수집된 GPS 포인트가 너무 적습니다 (${pts.length}개).\n야외에서 최소 20초 이상 이동 후 종료해주세요.` });
      return;
    }
    const analyzed = analyzeGpsPoints(pts, '스마트폰 실시간 GPS 측정');
    if (analyzed) {
      setGpsSession(analyzed);
      setGpsFlipVertical(false);
      setGpsRotate90(false);
      setGpsReplayPlaying(false);
      setGpsReplayProgress(0);
    }
  };

  useEffect(() => {
    return () => {
      if (liveGpsWatchIdRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(liveGpsWatchIdRef.current);
      if (liveGpsTimerRef.current) clearInterval(liveGpsTimerRef.current);
      if (gpsReplayRafRef.current) cancelAnimationFrame(gpsReplayRafRef.current);
    };
  }, []);

  const getTransformedPitchPoint = (pt) => {
    let x = pt.x;
    let y = pt.y;
    if (gpsRotate90) {
      const tmp = x;
      x = 100 - y;
      y = tmp;
    }
    if (gpsFlipVertical) {
      x = 100 - x;
      y = 100 - y;
    }
    return { x, y, speed: pt.speed, t: pt.t, hr: pt.hr };
  };

  // 2D 축구장 히트맵 / 스프린트 / 리플레이 캔버스 렌더링
  useEffect(() => {
    if (activeTab !== 'gps' || !gpsSession || !gpsCanvasRef.current) return;
    const canvas = gpsCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    // 1. 경기장 잔디 배경 (줄무늬 효과)
    ctx.clearRect(0, 0, W, H);
    const stripeCount = 10;
    const stripeH = H / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#065F46' : '#047857';
      ctx.fillRect(0, i * stripeH, W, stripeH);
    }

    // 2. 축구장 라인 그리기
    const pad = 18;
    const pw = W - pad * 2;
    const ph = H - pad * 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(pad, pad, pw, ph);

    // 하프라인 & 센터서클
    ctx.beginPath();
    ctx.moveTo(pad, H / 2);
    ctx.lineTo(W - pad, H / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(W / 2, H / 2, pw * 0.16, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 3, 0, Math.PI * 2);
    ctx.fill();

    // 상/하단 페널티 박스 및 골 에어리어
    const penW = pw * 0.58;
    const penH = ph * 0.155;
    const goalW = pw * 0.28;
    const goalH = ph * 0.055;
    ctx.strokeRect((W - penW) / 2, pad, penW, penH);
    ctx.strokeRect((W - goalW) / 2, pad, goalW, goalH);
    ctx.strokeRect((W - penW) / 2, H - pad - penH, penW, penH);
    ctx.strokeRect((W - goalW) / 2, H - pad - goalH, goalW, goalH);

    // 공격 방향 워터마크 화살표
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('▲ 공격 방향', W - pad - 8, pad + 18);
    ctx.restore();

    const allPts = (gpsSession.points || []).map(getTransformedPitchPoint);
    if (allPts.length === 0) return;

    const visibleCount = gpsViewMode === 'replay'
      ? Math.max(1, Math.floor((gpsReplayProgress / 100) * allPts.length))
      : allPts.length;
    const pts = allPts.slice(0, visibleCount);

    // 3. 모드별 오버레이 렌더링
    if (gpsViewMode === 'heatmap' || gpsViewMode === 'replay') {
      const heatCanvas = document.createElement('canvas');
      heatCanvas.width = W;
      heatCanvas.height = H;
      const hCtx = heatCanvas.getContext('2d');

      const radius = gpsViewMode === 'replay' ? 24 : 30;
      const baseAlpha = Math.max(0.08, Math.min(0.26, 22 / Math.sqrt(allPts.length)));

      pts.forEach(p => {
        const px = (p.x / 100) * W;
        const py = (p.y / 100) * H;
        const grad = hCtx.createRadialGradient(px, py, 2, px, py, radius);
        const weight = p.speed >= 18 ? baseAlpha * 1.35 : baseAlpha;
        grad.addColorStop(0, `rgba(0, 0, 0, ${ Math.min(0.5, weight) })`);
        grad.addColorStop(0.55, `rgba(0, 0, 0, ${ Math.min(0.25, weight * 0.5) })`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        hCtx.fillStyle = grad;
        hCtx.beginPath();
        hCtx.arc(px, py, radius, 0, Math.PI * 2);
        hCtx.fill();
      });

      const imgData = hCtx.getImageData(0, 0, W, H);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 12) {
          data[i + 3] = 0;
          continue;
        }
        const v = Math.min(1, a / 215);
        let r = 0, g = 0, b = 0, outA = 0;
        if (v < 0.25) {
          const t = v / 0.25;
          r = 0; g = Math.round(180 * t); b = 255;
          outA = Math.round(90 + 70 * t);
        } else if (v < 0.55) {
          const t = (v - 0.25) / 0.3;
          r = Math.round(120 * t); g = 255; b = Math.round(255 * (1 - t));
          outA = Math.round(160 + 40 * t);
        } else if (v < 0.8) {
          const t = (v - 0.55) / 0.25;
          r = 255; g = Math.round(255 - 120 * t); b = 0;
          outA = Math.round(200 + 30 * t);
        } else {
          const t = (v - 0.8) / 0.2;
          r = 255; g = Math.round(135 * (1 - t)); b = Math.round(40 * t);
          outA = 238;
        }
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = outA;
      }
      hCtx.putImageData(imgData, 0, 0);
      ctx.drawImage(heatCanvas, 0, 0);
    }

    if (gpsViewMode === 'sprint') {
      // 전체 이동 동선 (은은한 실선)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      pts.forEach((p, idx) => {
        const px = (p.x / 100) * W;
        const py = (p.y / 100) * H;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      // 고속 러닝(14~20km/h) 및 스프린트(20km/h+) 구간 강조
      for (let i = 1; i < pts.length; i++) {
        const p1 = pts[i - 1];
        const p2 = pts[i];
        if (p2.speed < 14) continue;
        const isSprint = p2.speed >= 19.5;
        const x1 = (p1.x / 100) * W, y1 = (p1.y / 100) * H;
        const x2 = (p2.x / 100) * W, y2 = (p2.y / 100) * H;

        ctx.strokeStyle = isSprint ? '#FACC15' : '#38BDF8';
        ctx.lineWidth = isSprint ? 3.5 : 2.2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        if (isSprint && (i % 2 === 0 || i === pts.length - 1)) {
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const head = 7;
          ctx.fillStyle = '#FACC15';
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    if (gpsViewMode === 'replay' && pts.length > 0) {
      // 최근 12포인트 꼬리 궤적
      const tail = pts.slice(Math.max(0, pts.length - 14));
      for (let i = 1; i < tail.length; i++) {
        const alpha = i / tail.length;
        ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
        ctx.lineWidth = 1.5 + alpha * 2.5;
        ctx.beginPath();
        ctx.moveTo((tail[i - 1].x / 100) * W, (tail[i - 1].y / 100) * H);
        ctx.lineTo((tail[i].x / 100) * W, (tail[i].y / 100) * H);
        ctx.stroke();
      }

      // 현재 위치 선수 마커
      const cur = pts[pts.length - 1];
      const cx = (cur.x / 100) * W;
      const cy = (cur.y / 100) * H;

      ctx.fillStyle = cur.speed >= 19.5 ? 'rgba(250, 204, 21, 0.35)' : 'rgba(59, 130, 246, 0.35)';
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = cur.speed >= 19.5 ? '#EAB308' : '#2563EB';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 현재 속도 뱃지
      const label = `${cur.speed.toFixed(1)} km/h`;
      ctx.font = 'bold 11px sans-serif';
      const tw = ctx.measureText(label).width + 12;
      const bx = Math.max(24, Math.min(W - 24 - tw, cx - tw / 2));
      const by = cy > 40 ? cy - 28 : cy + 14;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(bx, by, tw, 18);
      ctx.strokeStyle = cur.speed >= 19.5 ? '#FACC15' : '#38BDF8';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, tw, 18);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + tw / 2, by + 9);
    }
  }, [activeTab, gpsSession, gpsViewMode, gpsFlipVertical, gpsRotate90, gpsReplayProgress]);

  // 2D 동선 리플레이 애니메이션 루프
  useEffect(() => {
    if (!gpsReplayPlaying || !gpsSession) return;
    let lastTs = null;
    const step = (ts) => {
      if (!lastTs) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      setGpsReplayProgress(prev => {
        const next = prev + dt * 6 * gpsReplaySpeed;
        if (next >= 100) {
          setGpsReplayPlaying(false);
          return 100;
        }
        return next;
      });
      gpsReplayRafRef.current = requestAnimationFrame(step);
    };
    gpsReplayRafRef.current = requestAnimationFrame(step);
    return () => {
      if (gpsReplayRafRef.current) cancelAnimationFrame(gpsReplayRafRef.current);
    };
  }, [gpsReplayPlaying, gpsReplaySpeed, gpsSession]);

  const saveGpsSessionToTeam = async () => {
    if (!gpsSession || !activeTeamId || isProcessing) return;
    const playerObj = currentTeamPlayers.find(p => p.id === gpsSelectedPlayerId);
    const playerName = playerObj ? playerObj.name : '미지정 선수';
    const recordToSave = {
      ...gpsSession,
      id: 'gps_' + Date.now(),
      playerId: gpsSelectedPlayerId || null,
      playerName,
      quarterLabel: gpsQuarterLabel,
      savedAt: new Date().toISOString()
    };
    setIsProcessing(true);
    try {
      const updated = [recordToSave, ...savedGpsRecords].slice(0, 25);
      await setDoc(doc(db, 'memos', `${activeTeamId}___gps_records__`), {
        teamId: activeTeamId,
        date: '__gps_records__',
        content: JSON.stringify(updated)
      });
      setSystemAlert({ isOpen: true, message: `${playerName} 선수의 GPS 히트맵 기록이 팀 기록에 저장되었습니다!` });
    } catch (err) {
      console.error(err);
      setSystemAlert({ isOpen: true, message: 'GPS 기록 저장 중 오류가 발생했습니다.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const requestDeleteGpsRecord = (recordId) => {
    setSystemConfirm({
      isOpen: true,
      message: '이 GPS 분석 기록을 삭제하시겠습니까?',
      onConfirm: async () => {
        if (!activeTeamId || isProcessing) return;
        setIsProcessing(true);
        try {
          const updated = savedGpsRecords.filter(r => r.id !== recordId);
          await setDoc(doc(db, 'memos', `${activeTeamId}___gps_records__`), {
            teamId: activeTeamId,
            date: '__gps_records__',
            content: JSON.stringify(updated)
          });
        } finally {
          setIsProcessing(false);
        }
      }
    });
  };

  const triggerGpsShare = () => {
    if (!gpsCardCaptureRef.current) return;
    setShareModal({ isOpen: true, step: 1, data: null, file: null, imgUrl: null, isVideo: false });
    setTimeout(async () => {
      try {
        const html2canvas = await loadHtml2Canvas();
        const canvas = await html2canvas(gpsCardCaptureRef.current, { scale: 2, useCORS: true, backgroundColor: '#0F172A' });
        canvas.toBlob((blob) => {
          if (!blob) return;
          const file = new File([blob], 'matchboard_gps_heatmap.png', { type: 'image/png' });
          const imgUrl = URL.createObjectURL(blob);
          setShareModal(prev => ({ ...prev, step: 2, file, imgUrl, isVideo: false }));
        }, 'image/png');
      } catch (err) {
        setSystemAlert({ isOpen: true, message: '이미지 생성 중 오류가 발생했습니다.' });
        setShareModal({ isOpen: false, step: 1, data: null, file: null, imgUrl: null, isVideo: false });
      }
    }, 300);
  };

  const StandingsTable = ({ match, isLarge }) => {
    const isTour = match.isTournament; const standings = isTour ? calculateTournamentStandings(match) : calculateStandings(match);
    const textClass = isLarge ? "text-2xl py-6" : "text-xs py-2"; const headerClass = isLarge ? "pb-6" : "pb-2";
    if (isTour) {
      return (
        <table className={`w-full text-center ${isLarge ? 'text-2xl' : 'text-xs'}`}>
          <thead><tr className="text-slate-500 font-bold border-b border-slate-700/50"><th className={headerClass}>순위</th><th className={`${headerClass} text-left`}>팀</th><th className={headerClass}>총점</th><th className={headerClass}>1S</th><th className={headerClass}>2S</th><th className={headerClass}>3S</th><th className={headerClass}>득실</th></tr></thead>
          <tbody>
            {standings.map((st, i) => (
              <tr key={st.team} className="border-t border-slate-800/50">
                <td className={`${textClass} font-black ${i === 0 ? 'text-yellow-400' : 'text-slate-400'}`}>{i + 1}</td>
                <td className={`${textClass} text-left font-bold ${TEAM_TEXT_COLORS[st.team]}`}>{getTeamDisplayName(match, st.team)}</td>
                <td className={`${textClass} text-blue-400 font-black`}>{st.setPts}</td>
                <td className={`${textClass} text-white`}>{st.s1 || '-'}</td><td className={`${textClass} text-white`}>{st.s2 || '-'}</td><td className={`${textClass} text-white`}>{st.s3 || '-'}</td>
                <td className={`${textClass} text-white`}>{st.gd > 0 ? '+'+st.gd : st.gd}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    return (
      <table className={`w-full text-center ${isLarge ? 'text-2xl' : 'text-xs'}`}>
        <thead><tr className="text-slate-500 font-bold border-b border-slate-700/50"><th className={headerClass}>순위</th><th className={`${headerClass} text-left`}>팀</th><th className={headerClass}>승점</th><th className={headerClass}>승(W)</th><th className={headerClass}>무(D)</th><th className={headerClass}>패(L)</th><th className={headerClass}>득실</th></tr></thead>
        <tbody>
          {standings.map((st, i) => (
            <tr key={st.team} className="border-t border-slate-800/50">
              <td className={`${textClass} font-black ${i === 0 ? 'text-yellow-400' : 'text-slate-400'}`}>{i + 1}</td>
              <td className={`${textClass} text-left font-bold ${TEAM_TEXT_COLORS[st.team]}`}>{getTeamDisplayName(match, st.team)}</td>
              <td className={`${textClass} text-blue-400 font-black`}>{st.pts}</td>
              <td className={`${textClass} text-white`}>{st.w}</td><td className={`${textClass} text-slate-400`}>{st.d}</td><td className={`${textClass} text-slate-400`}>{st.l}</td>
              <td className={`${textClass} text-white`}>{st.gd > 0 ? '+'+st.gd : st.gd}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderSystemModals = () => (
    <>
      {systemAlert.isOpen && ( <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4"><div className="bg-slate-800 p-6 rounded-2xl max-w-sm w-full border border-slate-700 shadow-xl text-center animate-in fade-in zoom-in-95 duration-200"><p className="text-white font-bold mb-6 whitespace-pre-line">{systemAlert.message}</p><button onClick={() => setSystemAlert({isOpen: false, message: ''})} className="w-full py-3 bg-blue-500 hover:bg-blue-400 transition text-white rounded-xl font-bold">확인</button></div></div> )}
      {systemConfirm.isOpen && ( <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4"><div className="bg-slate-800 p-6 rounded-2xl max-w-sm w-full border border-slate-700 shadow-xl text-center animate-in fade-in zoom-in-95 duration-200"><p className="text-white font-bold mb-6 whitespace-pre-line">{systemConfirm.message}</p><div className="flex gap-3"><button onClick={() => setSystemConfirm({isOpen: false, message: '', onConfirm: null})} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 transition text-white rounded-xl font-bold">취소</button><button onClick={() => { systemConfirm.onConfirm(); setSystemConfirm({isOpen: false, message: '', onConfirm: null}); }} className="flex-1 py-3 bg-blue-500 hover:bg-blue-400 transition text-white rounded-xl font-bold">확인</button></div></div></div> )}
      {isProcessing && ( <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"><div className="bg-slate-800 p-6 rounded-3xl flex flex-col items-center shadow-xl border border-slate-700 animate-in fade-in zoom-in-95"><div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div><p className="text-white font-bold text-sm tracking-wide">데이터 처리 중...</p></div></div> )}
    </>
  );

  const renderQuarterLogsBlock = (match, qs, canEdit) => {
    const qLogs = (match.logs || []).filter(l => l.quarter === qs.quarter);
    if (qLogs.length === 0) return <div className="text-sm text-slate-500 italic text-center py-2">득점 기록이 없습니다.</div>;
    return (
      <div className="space-y-3">
        {qLogs.map(l => {
          const isLeft = l.teamLetter === qs.team1;
          return (
            <div key={l.id} onClick={() => { if(canEdit && checkCanEdit(match)) { const enriched = {...l}; if(!enriched.scorerId && enriched.scorerName) enriched.scorerId = players.find(p=>p.name===enriched.scorerName)?.id; if(!enriched.assistId && enriched.assistName) enriched.assistId = players.find(p=>p.name===enriched.assistName)?.id; setLogEditModal({isOpen: true, match, log: enriched}); } }} className={`flex items-start gap-2 w-full ${isLeft ? 'flex-row' : 'flex-row-reverse'} ${canEdit && checkCanEdit(match) ? 'cursor-pointer hover:bg-slate-800 p-1 rounded-lg transition -mx-1 px-1' : ''}`}>
              <span className="text-slate-600 text-[10px] w-8 shrink-0 text-center mt-1">{l.time}</span>
              <div className={`flex flex-col ${isLeft ? 'items-start' : 'items-end'}`}>
                <div className="text-white font-bold text-sm flex items-center gap-1"><span className={TEAM_TEXT_COLORS[l.teamLetter]}>⚽</span> {l.scorerName} {l.isPK && <span className="text-[9px] bg-red-500/20 text-red-400 px-1 py-0.5 rounded ml-1 border border-red-500/30">PK</span>}</div>
                {l.remark && <div className="text-[11px] bg-slate-800/80 px-2 py-1 rounded text-slate-300 mt-1 inline-block border border-slate-700">{l.remark}</div>}
                {l.assistName && <div className="text-slate-400 mt-1 flex items-center gap-1"><Footprints size={12} className="text-slate-500"/> <span className="text-xs">{l.assistName}</span></div>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderQuarterGkBadge = (match, qs) => {
    const gk1Name = getGkDisplayName(qs.gk1);
    const gk2Name = match.matchType === 'external' ? null : getGkDisplayName(qs.gk2);
    if (!gk1Name && !gk2Name) return null;
    return (
      <div className="flex justify-between items-center text-[11px] bg-slate-800/60 px-3 py-1.5 rounded-lg mb-3 border border-slate-700/60">
        <div className="flex items-center gap-1 text-slate-300">
          {gk1Name ? <><span>🧤</span><span className={`font-bold ${TEAM_TEXT_COLORS[qs.team1]}`}>{getTeamDisplayName(match, qs.team1)}</span><span>GK: <strong className="text-white">{gk1Name}</strong> <span className="text-slate-400">({qs.score2}실점)</span></span></> : <span className="text-slate-500">🧤 GK 미지정</span>}
        </div>
        {match.matchType !== 'external' && (
          <div className="flex items-center gap-1 text-slate-300">
            {gk2Name ? <><span>🧤</span><span className={`font-bold ${TEAM_TEXT_COLORS[qs.team2]}`}>{getTeamDisplayName(match, qs.team2)}</span><span>GK: <strong className="text-white">{gk2Name}</strong> <span className="text-slate-400">({qs.score1}실점)</span></span></> : <span className="text-slate-500">🧤 GK 미지정</span>}
          </div>
        )}
      </div>
    );
  };

  const renderQuartersList = (match) => {
    if (match.isTournament) {
      let elements = [];
      for (let setNum = 1; setNum <= 3; setNum++) {
        const setQuarters = [1, 2, 3, 4].map(i => (setNum - 1) * 4 + i); const playedInSet = (match.quarterScores || []).filter(qs => setQuarters.includes(qs.quarter));
        if (playedInSet.length === 0) { elements.push( <div key={`set-${setNum}`} className="bg-slate-800/30 rounded-2xl p-4 border border-slate-700/50 border-dashed mb-4 flex justify-center items-center h-20"><span className="text-slate-500 font-bold text-[13px]">{setNum}세트 전체 - 미진행 (조기종료)</span></div> ); } 
        else {
          setQuarters.forEach(qNum => {
            const qs = playedInSet.find(q => q.quarter === qNum);
            if (qs) {
              const { title } = getTournamentQuarterInfo(qs.quarter);
              elements.push(
                <div key={qs.quarter} className="bg-slate-900 rounded-2xl p-4 border border-slate-700 mb-4">
                  <div className="relative flex justify-center items-center border-b border-slate-800 pb-3 mb-3">
                    <span className="absolute left-0 font-black text-blue-400 text-xs">{title}</span>
                    <span className="font-bold text-white text-lg flex items-center"><span className={TEAM_TEXT_COLORS[qs.team1]}>{getTeamDisplayName(match, qs.team1)}</span> <span className="text-slate-500 mx-3">{qs.score1} : {qs.score2}</span> <span className={TEAM_TEXT_COLORS[qs.team2]}>{getTeamDisplayName(match, qs.team2)}</span></span>
                    {checkCanEdit(match) && ( <button onClick={() => setQuarterEditModal({isOpen: true, match, quarterScore: qs})} className="absolute right-0 text-slate-500 p-1 bg-slate-800 rounded-md"><Edit size={14}/></button> )}
                  </div>
                  {renderQuarterGkBadge(match, qs)}
                  {renderQuarterLogsBlock(match, qs, true)}
                  {checkCanEdit(match) && (
                    <div className="flex justify-center gap-2 mt-4 pt-4 border-t border-slate-800/50">
                      <button onClick={() => setGoalFlow({ isOpen: true, step: 1, matchId: match.id, quarter: qs.quarter, teamLetter: qs.team1, availableTeams: [qs.team1, qs.team2], scorer: null, isPK: false, remark: '', isMissingAdd: true })} className="text-[11px] bg-slate-800 text-slate-400 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-slate-700 transition"><Plus size={12}/> {getTeamDisplayName(match, qs.team1)} 득점 추가</button>
                      <button onClick={() => setGoalFlow({ isOpen: true, step: 1, matchId: match.id, quarter: qs.quarter, teamLetter: qs.team2, availableTeams: [qs.team1, qs.team2], scorer: null, isPK: false, remark: '', isMissingAdd: true })} className="text-[11px] bg-slate-800 text-slate-400 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-slate-700 transition"><Plus size={12}/> {getTeamDisplayName(match, qs.team2)} 득점 추가</button>
                    </div>
                  )}
                </div>
              );
            } else { elements.push( <div key={`q-${qNum}`} className="bg-slate-800/30 rounded-xl p-3 border border-slate-700/50 border-dashed mb-4 flex justify-center items-center"><span className="text-slate-500 font-bold text-xs">{getTournamentQuarterInfo(qNum).title} - 미진행</span></div> ); }
          });
        }
      } return elements;
    } else {
      let elements = [];
      for (let i = 1; i <= match.totalQuarters; i++) {
        const qs = (match.quarterScores || []).find(q => q.quarter === i);
        if (qs) {
          elements.push(
            <div key={qs.quarter} className="bg-slate-900 rounded-2xl p-4 border border-slate-700 mb-4">
              <div className="relative flex justify-center items-center border-b border-slate-800 pb-3 mb-3">
                <span className="absolute left-0 font-black text-blue-400">{qs.quarter}Q</span>
                <span className="font-bold text-white text-lg flex items-center"><span className={TEAM_TEXT_COLORS[qs.team1]}>{getTeamDisplayName(match, qs.team1)}</span> <span className="text-slate-500 mx-3">{qs.score1} : {qs.score2}</span> <span className={TEAM_TEXT_COLORS[qs.team2]}>{getTeamDisplayName(match, qs.team2)}</span></span>
                {checkCanEdit(match) && ( <button onClick={() => setQuarterEditModal({isOpen: true, match, quarterScore: qs})} className="absolute right-0 text-slate-500 p-1 bg-slate-800 rounded-md"><Edit size={14}/></button> )}
              </div>
              {renderQuarterGkBadge(match, qs)}
              {renderQuarterLogsBlock(match, qs, true)}
              {checkCanEdit(match) && (
                <div className="flex justify-center gap-2 mt-4 pt-4 border-t border-slate-800/50">
                  <button onClick={() => setGoalFlow({ isOpen: true, step: 1, matchId: match.id, quarter: qs.quarter, teamLetter: qs.team1, availableTeams: [qs.team1, qs.team2], scorer: null, isPK: false, remark: '', isMissingAdd: true })} className="text-[11px] bg-slate-800 text-slate-400 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-slate-700 transition"><Plus size={12}/> {getTeamDisplayName(match, qs.team1)} 득점 추가</button>
                  <button onClick={() => setGoalFlow({ isOpen: true, step: 1, matchId: match.id, quarter: qs.quarter, teamLetter: qs.team2, availableTeams: [qs.team1, qs.team2], scorer: null, isPK: false, remark: '', isMissingAdd: true })} className="text-[11px] bg-slate-800 text-slate-400 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-slate-700 transition"><Plus size={12}/> {getTeamDisplayName(match, qs.team2)} 득점 추가</button>
                </div>
              )}
            </div>
          );
        } else if (match.status === 'completed') { elements.push( <div key={`q-${i}`} className="bg-slate-800/30 rounded-xl p-3 border border-slate-700/50 border-dashed mb-4 flex justify-center items-center"><span className="text-slate-500 font-bold text-xs">{i}Q 미진행 (조기종료)</span></div> ); }
      } return elements;
    }
  };

  const renderQuarterEditModal = () => {
    if (!quarterEditModal.isOpen || !quarterEditModal.match || !quarterEditModal.quarterScore) return null;
    const m = quarterEditModal.match; const qs = quarterEditModal.quarterScore; const maxTeams = getMatchTeamCount(m);
    const { teamPlayers: t1Players, otherPlayers: t1Others } = getTeamCandidatePlayers(m, qs.team1);
    const { teamPlayers: t2Players, otherPlayers: t2Others } = getTeamCandidatePlayers(m, qs.team2);
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[150] animate-in fade-in">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2"><Edit size={18}/> {qs.quarter}Q 쿼터/골키퍼 수정</h2>
            <button onClick={() => setQuarterEditModal({isOpen: false, match: null, quarterScore: null})} className="text-slate-400 hover:text-white"><X size={20}/></button>
          </div>
          <form onSubmit={handleQuarterEditSave} className="space-y-4">
            {m.matchType === 'external' ? (
              <>
                <input type="hidden" name="team1" value={qs.team1} />
                <input type="hidden" name="team2" value={qs.team2} />
              </>
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex-1"><label className="block text-xs font-bold text-slate-400 mb-2 text-center">홈 팀</label><select name="team1" defaultValue={qs.team1} className={`w-full bg-slate-900 border border-slate-700 p-3 rounded-xl outline-none font-bold text-center ${TEAM_TEXT_COLORS[qs.team1]}`}>{TEAM_LETTERS.slice(0, maxTeams).map(t => <option key={t} value={t} className={TEAM_TEXT_COLORS[t]}>{t}팀</option>)}</select></div>
                <div className="flex-1"><label className="block text-xs font-bold text-slate-400 mb-2 text-center">원정 팀</label><select name="team2" defaultValue={qs.team2} className={`w-full bg-slate-900 border border-slate-700 p-3 rounded-xl outline-none font-bold text-center ${TEAM_TEXT_COLORS[qs.team2]}`}>{TEAM_LETTERS.slice(0, maxTeams).map(t => <option key={t} value={t} className={TEAM_TEXT_COLORS[t]}>{t}팀</option>)}</select></div>
              </div>
            )}
            <div className="space-y-3 pt-2 border-t border-slate-700/60">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">🧤 {getTeamDisplayName(m, qs.team1)} 골키퍼 (GK)</label>
                <select name="gk1" defaultValue={qs.gk1 || 'none'} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none text-sm font-bold">
                  <option value="none">미지정</option>
                  <option value="mercenary">👤 용병</option>
                  <optgroup label="소속/참석 선수">{t1Players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
                  {t1Others.length > 0 && <optgroup label="타팀 지원">{t1Others.map(p => <option key={p.id} value={p.id}>({(m.teamAssignments || {})[p.id] ? `${m.teamAssignments[p.id]}팀` : '미정'}) {p.name}</option>)}</optgroup>}
                </select>
              </div>
              {m.matchType !== 'external' && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">🧤 {getTeamDisplayName(m, qs.team2)} 골키퍼 (GK)</label>
                  <select name="gk2" defaultValue={qs.gk2 || 'none'} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none text-sm font-bold">
                    <option value="none">미지정</option>
                    <option value="mercenary">👤 용병</option>
                    <optgroup label="소속/참석 선수">{t2Players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
                    {t2Others.length > 0 && <optgroup label="타팀 지원">{t2Others.map(p => <option key={p.id} value={p.id}>({(m.teamAssignments || {})[p.id] ? `${m.teamAssignments[p.id]}팀` : '미정'}) {p.name}</option>)}</optgroup>}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-2 border-t border-slate-700"><button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">수정 저장</button></div>
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
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${detailMatch.matchType === 'external' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : detailMatch.matchType === 'futsal' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'}`}>{detailMatch.matchType === 'external' ? '교류전' : detailMatch.matchType === 'futsal' ? '풋살' : '자체전'}</span>
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
            {checkCanEdit(detailMatch) && ( <button onClick={() => { setDetailModal({isOpen: false, match: null}); setDetailModalMatchId(null); openMatchModal(detailMatch); }} className="w-full mt-3 bg-slate-800 text-blue-400 py-2 rounded-xl text-xs font-bold border border-blue-500/30 hover:bg-slate-700 transition flex items-center justify-center gap-1"><Edit size={14}/> 경기 설정 (타입 / 장소 / 명단) 변경</button> )}
          </div>
          <div className="flex-1 overflow-y-auto p-6 hide-scrollbar space-y-6">
            <div className="bg-slate-900 rounded-2xl p-4 border border-slate-700"><div className="text-xs text-slate-400 mb-3 font-bold border-b border-slate-800 pb-2">순위표</div><StandingsTable match={detailMatch} isLarge={false} /></div>
            <div className="space-y-4">{renderQuartersList(detailMatch)}</div>
            <div className="bg-slate-900 rounded-2xl p-4 border border-slate-700">
              <div className="text-xs text-slate-400 mb-4 font-bold border-b border-slate-800 pb-2 flex justify-between items-end">
                  <span>참석자 최종 편성 명단</span>
                  {checkCanEdit(detailMatch) && ( <button onClick={() => { setDetailModal({isOpen: false, match: null}); setDetailModalMatchId(null); setAssignmentModal({ isOpen: true, match: detailMatch }); }} className="bg-slate-800 text-purple-400 px-2.5 py-1 rounded text-[10px] font-bold border border-purple-500/30 flex items-center gap-1 hover:bg-slate-700 transition"><Users size={12}/> 편성 수정</button> )}
              </div>
              <div className="space-y-4">
                {TEAM_LETTERS.slice(0, actualTeamCount).map(teamLetter => {
                  const teamPlayers = players.filter(p => (detailMatch.attendees || []).includes(p.id) && ((detailMatch.teamAssignments || {})[p.id]) === teamLetter);
                  if(teamPlayers.length === 0) return null;
                  return (
                    <div key={teamLetter}>
                      <div className={`text-[11px] font-black mb-2 ${TEAM_TEXT_COLORS[teamLetter]}`}>{getTeamDisplayName(detailMatch, teamLetter)}</div>
                      <div className="flex flex-wrap gap-2">{teamPlayers.map(p => ( <div key={p.id} className="bg-slate-800 px-3.5 py-2.5 rounded-full border border-slate-600/50 flex items-center"><span className="font-bold text-white text-[14px] tracking-wide">{p.name}</span></div> ))}</div>
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
              <div className="flex-1"><label className="block text-xs font-bold text-slate-400 mb-1">날짜</label><input type="date" name="date" required defaultValue={matchModal.match?.date || getTodayString()} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" /></div>
              <div className="flex-1"><label className="block text-xs font-bold text-slate-400 mb-1">시간</label><input type="time" name="time" required defaultValue={matchModal.match?.time || "06:30"} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" /></div>
            </div>
            <div><label className="block text-xs font-bold text-slate-400 mb-1">경기 장소</label><input type="text" name="location" required defaultValue={matchModal.match?.location || ""} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" /></div>
            {matchTypeForm === 'external' && ( <div><label className="block text-xs font-bold text-purple-400 mb-1">상대팀 이름</label><input type="text" name="opponentName" required defaultValue={matchModal.match?.opponentName || ""} className="w-full bg-slate-900 border border-purple-500/50 p-3 rounded-xl text-white outline-none" /></div> )}
            <div className="flex gap-4">
              {(matchTypeForm === 'internal' || matchTypeForm === 'futsal') && (
                <div className="flex-1"><label className="block text-xs font-bold text-slate-400 mb-1">총 팀 개수</label><select name="teamCount" id="teamCountSelect" defaultValue={matchModal.match?.teamCount || 2} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" onChange={(e)=>{ const isTourRow = document.getElementById('isTournamentRow'); const chk = document.getElementById('isTournamentChk'); const qInput = document.getElementById('totalQuartersInput'); if(e.target.value === '4') { if(isTourRow) isTourRow.style.display = 'flex'; } else { if(isTourRow) isTourRow.style.display = 'none'; if(chk) chk.checked = false; if(qInput) qInput.readOnly = false; } }}><option value="2">2팀 (A,B)</option><option value="3">3팀 (A,B,C)</option><option value="4">4팀 (A,B,C,D)</option></select></div>
              )}
              <div className={matchTypeForm === 'external' ? 'w-full' : 'flex-1'}><label className="block text-xs font-bold text-slate-400 mb-1">총 쿼터 수</label><input type="number" id="totalQuartersInput" name="totalQuarters" required defaultValue={matchModal.match?.totalQuarters || 4} min="1" max="20" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" /></div>
            </div>
            {(matchTypeForm === 'internal' || matchTypeForm === 'futsal') && (
              <div id="isTournamentRow" className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-xl" style={{ display: (matchModal.match?.teamCount == 4 || (document.getElementById('teamCountSelect')?.value == '4')) ? 'flex' : 'none' }}>
                <input type="checkbox" id="isTournamentChk" name="isTournament" value="true" defaultChecked={matchModal.match?.isTournament} className="w-5 h-5 accent-yellow-500" onChange={(e)=>{ const qInput = document.getElementById('totalQuartersInput'); if(e.target.checked) { if(qInput) { qInput.value = 12; qInput.readOnly = true; } } else { if(qInput) qInput.readOnly = false; } }} />
                <div><div className="text-sm font-bold text-yellow-400 flex items-center gap-1"><Trophy size={16}/> 4팀 3세트 토너먼트 모드</div><div className="text-[10px] text-yellow-500/70">체크 시 총 12쿼터 고정 및 승점 로직이 적용됩니다.</div></div>
              </div>
            )}
            <div className="pt-2"><label className="block text-xs font-bold text-slate-400 mb-2">참석자 체크</label><div className="grid grid-cols-2 gap-2">{currentTeamPlayers.map(p => ( <label key={p.id} className="flex items-center gap-2 bg-slate-900 p-3 rounded-lg border border-slate-700 cursor-pointer hover:border-slate-500"><input type="checkbox" name={`attendee_${p.id}`} defaultChecked={matchModal.match ? (matchModal.match.attendees || []).includes(p.id) : false} className="accent-blue-500 w-4 h-4 rounded" /><span className="text-sm font-bold text-white">{p.name}</span></label> ))}</div></div>
          </form>
          <div className="pt-4 shrink-0 border-t border-slate-700"><button type="submit" form="matchForm" className="w-full py-4 bg-blue-500 hover:bg-blue-400 text-white rounded-xl font-bold text-lg shadow-lg">저장하기</button></div>
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
          <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-700"><div><h2 className="text-lg font-bold text-white">참석자 팀 편성</h2></div><button onClick={() => setAssignmentModal({isOpen: false, match: null})} className="text-white bg-blue-500 px-4 py-2 rounded-xl font-bold">완료</button></div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-2 hide-scrollbar">
            {currentTeamPlayers.filter(p => (assignmentModal.match.attendees || []).includes(p.id)).map(p => {
              const currentTeam = (assignmentModal.match.teamAssignments || {})[p.id] || null;
              return (
                <div key={p.id} className="bg-slate-900 p-3 rounded-xl flex justify-between items-center border border-slate-700">
                  <div className="font-bold text-white">{p.name} <span className="text-xs text-slate-500 ml-1">{p.birthYear}</span></div>
                  <div className="flex bg-slate-800 rounded-lg p-1 gap-1">{TEAM_LETTERS.slice(0, maxTeams).map(t => ( <button key={t} onClick={() => assignTeam(p.id, t)} className={`w-8 h-8 flex items-center justify-center text-xs font-black rounded-md transition ${currentTeam === t ? TEAM_COLORS[t] + ' shadow' : 'bg-slate-700 text-slate-400 hover:text-white'}`}>{t}</button> ))}</div>
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
  const currentGoalMatch = goalFlow.matchId ? matches.find(m => m.id === goalFlow.matchId) : liveMatch;
  const isExternalOpponent = currentGoalMatch?.matchType === 'external' && goalFlow.teamLetter === 'B';
  const teamRoster = players.filter(p => p.teamId === activeTeamId);
  const hasAttendees = (currentGoalMatch?.attendees || []).length > 0;
  const basePlayers = hasAttendees ? teamRoster.filter(p => (currentGoalMatch.attendees || []).includes(p.id)) : teamRoster;
  const assignedTeamPlayers = basePlayers.filter(p => ((currentGoalMatch?.teamAssignments || {})[p.id]) === goalFlow.teamLetter);
  const selectedTeamPlayers = isExternalOpponent
    ? []
    : currentGoalMatch?.matchType === 'external'
      ? basePlayers
      : (assignedTeamPlayers.length > 0 ? assignedTeamPlayers : basePlayers);
  const otherPlayers = isExternalOpponent || currentGoalMatch?.matchType === 'external'
    ? []
    : (assignedTeamPlayers.length > 0
        ? basePlayers.filter(p => ((currentGoalMatch?.teamAssignments || {})[p.id]) !== goalFlow.teamLetter)
        : teamRoster.filter(p => !basePlayers.some(bp => bp.id === p.id)));

  const isStep1 = goalFlow.step === 1;
  const selectedScorerName = goalFlow.scorer === 'mercenary'
    ? '용병'
    : (players.find(p => p.id === goalFlow.scorer)?.name || '');

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[150] animate-in fade-in">
      <div className={`bg-slate-800 rounded-2xl w-full max-w-sm p-5 border shadow-2xl transition-colors ${isStep1 ? 'border-slate-700' : 'border-emerald-500/50'}`}>
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-md text-xs font-black ${isStep1 ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
              STEP {goalFlow.step}/2
            </span>
            <h2 className="text-base font-black text-white">
              {isStep1 ? '⚽ 득점자 선택' : '👟 도움(어시스트) 선택'}
            </h2>
          </div>
          <button 
            onClick={() => {
              setGoalFlow({ isOpen: false, step: 1, matchId: null, quarter: null, teamLetter: null, availableTeams: [], scorer: null, isPK: false, remark: '', isMissingAdd: false }); 
              setShowOtherTeams(false);
            }} 
            className="text-slate-400 hover:text-white p-1"
          >
            <X size={18}/>
          </button>
        </div>

        {/* 2단계 진입 시: 선택된 득점자 확인 배너 + 단독 득점 빠른 완료 버튼 */}
        {!isStep1 && (
          <div className="mb-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-2 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-bold text-emerald-400 shrink-0">⚽ 득점:</span>
              <span className="text-xs font-black text-white truncate">{selectedScorerName}</span>
              <button
                type="button"
                onClick={() => setGoalFlow(prev => ({ ...prev, step: 1, scorer: null }))}
                className="text-[11px] font-bold text-slate-400 hover:text-white underline shrink-0 ml-1"
              >
                변경
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleGoalSubmit(null, goalFlow.teamLetter)}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-lg text-xs shrink-0 shadow transition"
            >
              도움 없음 (완료)
            </button>
          </div>
        )}

        {/* 누락 득점 추가 시 팀 선택 탭 */}
        {isStep1 && (goalFlow.availableTeams || []).length > 1 && (
          <div className="flex gap-1.5 mb-3 bg-slate-900 p-1 rounded-xl border border-slate-700">
            {goalFlow.availableTeams.map(tLetter => (
              <button
                key={tLetter}
                type="button"
                onClick={() => { setGoalFlow(prev => ({ ...prev, teamLetter: tLetter })); setShowOtherTeams(false); }}
                className={`flex-1 h-8 rounded-lg text-xs font-black transition ${goalFlow.teamLetter === tLetter ? TEAM_COLORS[tLetter] : 'text-slate-400 hover:text-white'}`}
              >
                {getTeamDisplayName(currentGoalMatch, tLetter)} 득점
              </button>
            ))}
          </div>
        )}

        {/* 명단 영역 */}
        {!isExternalOpponent && (
          <div className="mb-3">
            <div className="flex justify-between items-center mb-2">
              <div className="text-xs font-bold text-slate-400">
                {getTeamDisplayName(currentGoalMatch, goalFlow.teamLetter)} 명단 ({selectedTeamPlayers.length}명)
              </div>
              {currentGoalMatch?.matchType !== 'external' && otherPlayers.length > 0 && ( 
                <button 
                  type="button"
                  onClick={() => setShowOtherTeams(!showOtherTeams)} 
                  className={`text-xs px-2 py-1 rounded-lg border font-bold transition ${showOtherTeams ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-slate-700 text-slate-300 border-slate-600'}`}
                >
                  타팀 지원 {showOtherTeams ? '닫기' : '보기'}
                </button> 
              )}
            </div>
            
            <div className="grid grid-cols-4 gap-1.5 max-h-44 overflow-y-auto hide-scrollbar">
              {selectedTeamPlayers.map(p => {
                const isAlreadyScorer = !isStep1 && goalFlow.scorer === p.id;
                return (
                  <button 
                    key={p.id} 
                    disabled={isAlreadyScorer}
                    onClick={() => handleGoalSubmit(p.id, goalFlow.teamLetter)} 
                    className={`h-9 px-1 rounded-lg border font-bold text-xs truncate transition ${
                      isAlreadyScorer
                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-300 cursor-not-allowed'
                        : isStep1
                          ? 'bg-slate-700 hover:bg-blue-600 hover:border-blue-400 text-white border-slate-600'
                          : 'bg-slate-700 hover:bg-emerald-600 hover:border-emerald-400 text-white border-slate-600'
                    }`}
                  >
                    {isAlreadyScorer ? `⚽ ${p.name}` : p.name}
                  </button>
                );
              })}
            </div>
            
            {showOtherTeams && otherPlayers.length > 0 && ( 
              <div className="mt-2.5 pt-2.5 border-t border-slate-700">
                <div className="text-xs font-bold text-slate-400 mb-1.5">타팀 지원 인원</div>
                <div className="grid grid-cols-4 gap-1.5 max-h-28 overflow-y-auto hide-scrollbar">
                  {otherPlayers.map(p => {
                    const isAlreadyScorer = !isStep1 && goalFlow.scorer === p.id;
                    return (
                      <button 
                        key={p.id} 
                        disabled={isAlreadyScorer}
                        onClick={() => handleGoalSubmit(p.id, goalFlow.teamLetter)} 
                        className={`h-9 px-1 rounded-lg border font-bold text-xs truncate transition ${
                          isAlreadyScorer
                            ? 'bg-blue-500/20 border-blue-500/40 text-blue-300 cursor-not-allowed'
                            : 'bg-slate-900 hover:bg-slate-700 text-slate-300 border-slate-700'
                        }`}
                      >
                        {isAlreadyScorer ? `⚽ ${p.name}` : p.name}
                      </button>
                    );
                  })}
                </div>
              </div> 
            )}
          </div>
        )}

        {/* PK 여부 체크 및 기타 특이사항 입력 영역 */}
        <div className="space-y-1.5 pt-2.5 border-t border-slate-700">
          {isStep1 && (
            <label className="flex items-center gap-2 bg-slate-900 px-3 h-9 rounded-lg border border-slate-700 cursor-pointer hover:border-slate-600 transition">
              <input
                type="checkbox"
                checked={!!goalFlow.isPK}
                onChange={(e) => setGoalFlow(prev => ({ ...prev, isPK: e.target.checked }))}
                className="w-4 h-4 accent-red-500 rounded shrink-0"
              />
              <span className="text-xs font-bold text-white">PK (페널티킥) 득점 여부</span>
            </label>
          )}
          <input
            type="text"
            value={goalFlow.remark || ''}
            onChange={(e) => setGoalFlow(prev => ({ ...prev, remark: e.target.value }))}
            placeholder="기타 입력 / 특이사항 (선택, 예: 프리킥, 중거리슛)"
            className="w-full bg-slate-900 border border-slate-700 px-3 h-9 rounded-lg text-white text-xs outline-none focus:border-blue-500"
          />
        </div>
        
        {/* 하단 액션 버튼들 */}
        <div className="grid grid-cols-2 gap-1.5 mt-2.5 pt-2.5 border-t border-slate-700">
          <button 
            onClick={() => handleGoalSubmit(isExternalOpponent ? 'opponent' : 'mercenary', goalFlow.teamLetter)} 
            className="h-9 px-2 bg-slate-900 border border-slate-600 hover:bg-slate-700 text-slate-200 font-bold rounded-lg flex items-center justify-center gap-1 text-xs transition truncate"
          >
            {isExternalOpponent 
              ? `⚽ ${getTeamDisplayName(currentGoalMatch, goalFlow.teamLetter)} 득점` 
              : `👤 용병 ${isStep1 ? '득점' : '도움'}`}
          </button>
          
          {isStep1 ? ( 
            <button 
              onClick={() => handleGoalSubmit(null, goalFlow.teamLetter)} 
              className="h-9 px-2 bg-slate-900 border border-slate-700 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs transition truncate"
            >
              상대팀 자책골
            </button> 
          ) : ( 
            <button 
              onClick={() => handleGoalSubmit(null, goalFlow.teamLetter)} 
              className="h-9 px-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-lg shadow text-xs transition truncate"
            >
              도움 없음 (단독 득점)
            </button> 
          )}
        </div>
      </div>
    </div>
  );
};

  const renderLogEditModal = () => {
    if (!logEditModal.isOpen || !logEditModal.match || !logEditModal.log) return null;
    const m = logEditModal.match; const l = logEditModal.log;
    const isExternalOpponent = m.matchType === 'external' && l.teamLetter === 'B';
    const teamRoster = players.filter(p => p.teamId === activeTeamId);
    const hasAttendees = (m.attendees || []).length > 0;
    const basePlayers = hasAttendees ? teamRoster.filter(p => (m.attendees || []).includes(p.id)) : teamRoster;
    const assignedTeamPlayers = basePlayers.filter(p => ((m.teamAssignments || {})[p.id]) === l.teamLetter);
    const teamPlayers = isExternalOpponent
      ? []
      : m.matchType === 'external'
        ? basePlayers
        : (assignedTeamPlayers.length > 0 ? assignedTeamPlayers : basePlayers);
    const otherPlayers = isExternalOpponent || m.matchType === 'external'
      ? []
      : (assignedTeamPlayers.length > 0
          ? basePlayers.filter(p => ((m.teamAssignments || {})[p.id]) !== l.teamLetter)
          : teamRoster.filter(p => !basePlayers.some(bp => bp.id === p.id)));
    const defaultScorerValue = isExternalOpponent
      ? (l.scorerName === '상대팀' ? 'none' : 'opponent')
      : (l.scorerName === '용병' ? 'mercenary' : (l.scorerId || 'none'));
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[150] animate-in fade-in">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
          <div className="flex justify-between items-center mb-6"><h2 className="text-lg font-bold text-white flex items-center gap-2"><Edit size={18}/> 득점 기록 수정</h2><button onClick={() => setLogEditModal({isOpen: false, match: null, log: null})} className="text-slate-400 hover:text-white"><X size={20}/></button></div>
          <form onSubmit={handleLogEditSave} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">득점자</label>
              <select name="scorerId" defaultValue={defaultScorerValue} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none">
                {isExternalOpponent ? (
                  <>
                    <option value="opponent">⚽ {getTeamDisplayName(m, l.teamLetter)} 득점</option>
                    <option value="none">자책골 / 기타</option>
                  </>
                ) : (
                  <>
                    <option value="none">자책골 / 기타</option>
                    <optgroup label="우리 팀">
                      <option value="mercenary">👤 용병 (팀 외 인원)</option>
                      {teamPlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>
                    {m.matchType !== 'external' && otherPlayers.length > 0 && (
                      <optgroup label="타팀 지원">
                        {otherPlayers.map(p => <option key={p.id} value={p.id}>({(m.teamAssignments || {})[p.id] ? `${m.teamAssignments[p.id]}팀` : '미정'}) {p.name}</option>)}
                      </optgroup>
                    )}
                  </>
                )}
              </select>
            </div>
            {!isExternalOpponent && (
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">도움 (어시스트)</label>
                <select name="assistId" defaultValue={l.assistName === '용병' ? 'mercenary' : (l.assistId || 'none')} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none">
                  <option value="none">없음</option>
                  <optgroup label="우리 팀">
                    <option value="mercenary">👤 용병 (팀 외 인원)</option>
                    {teamPlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </optgroup>
                  {m.matchType !== 'external' && otherPlayers.length > 0 && (
                    <optgroup label="타팀 지원">
                      {otherPlayers.map(p => <option key={p.id} value={p.id}>({(m.teamAssignments || {})[p.id] ? `${m.teamAssignments[p.id]}팀` : '미정'}) {p.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
            )}
            <div className="flex items-center gap-3 bg-slate-900 p-3 rounded-xl border border-slate-700"><input type="checkbox" name="isPK" defaultChecked={l.isPK} className="w-5 h-5 accent-red-500" /><span className="text-sm font-bold text-white">PK 득점 여부</span></div>
            <div><input type="text" name="remark" defaultValue={l.remark || ''} placeholder="특이사항 (선택)" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" /></div>
            <div className="flex gap-2 pt-2 border-t border-slate-700"><button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">수정 완료</button></div>
            <button type="button" onClick={() => { setSystemConfirm({ isOpen: true, message: '이 득점 기록을 삭제하시겠습니까?', onConfirm: async () => { if(isProcessing) return; setIsProcessing(true); try { const updatePromises = []; if (l.scorerId) { const p = players.find(p => p.id === l.scorerId); if (p) updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, goals: Math.max(0, (p.goals || 0) - 1) })); } if (l.assistId) { const p = players.find(p => p.id === l.assistId); if (p) updatePromises.push(setDoc(doc(db, 'players', p.id), { ...p, assists: Math.max(0, (p.assists || 0) - 1) })); } const updatedLogs = (m.logs || []).filter(log => log.id !== l.id); let updatedQuarterScores = [...(m.quarterScores || [])]; const qsIndex = updatedQuarterScores.findIndex(qs => qs.quarter === l.quarter); if (qsIndex > -1) { const qs = updatedQuarterScores[qsIndex]; const isTeam1 = qs.team1 === l.teamLetter; updatedQuarterScores[qsIndex] = { ...qs, score1: isTeam1 ? Math.max(0, qs.score1 - 1) : qs.score1, score2: !isTeam1 ? Math.max(0, qs.score2 - 1) : qs.score2 }; } const updatedScores = { ...(m.scores || {}) }; if (updatedScores[l.teamLetter] !== undefined) updatedScores[l.teamLetter] = Math.max(0, updatedScores[l.teamLetter] - 1); updatePromises.push(setDoc(doc(db, 'matches', m.id), { ...m, logs: updatedLogs, scores: updatedScores, quarterScores: updatedQuarterScores })); await Promise.all(updatePromises); setLogEditModal({ isOpen: false, match: null, log: null }); } finally { setIsProcessing(false); } } }); }} className="w-full py-3 mt-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-bold text-sm flex items-center justify-center gap-1"><Trash2 size={16}/> 삭제</button>
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
            <div><label className="block text-xs font-bold text-slate-400 mb-1">이름</label><input type="text" name="name" required defaultValue={rosterModal.player?.name || ""} placeholder="선수 이름" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" /></div>
            <div><label className="block text-xs font-bold text-slate-400 mb-1">출생 연도 (2자리)</label><input type="number" name="birthYear" required defaultValue={rosterModal.player?.birthYear || ""} placeholder="예: 96" min="0" max="99" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" /></div>
            <div className="flex gap-3 pt-4 border-t border-slate-700"><button type="button" onClick={() => setRosterModal({isOpen: false, player: null})} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold transition hover:bg-slate-600">취소</button><button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold transition hover:bg-blue-400 shadow-lg">저장하기</button></div>
          </form>
        </div>
      </div>
    );
  };

  const renderAuthModal = () => {
    if (!authModal.isOpen) return null;
    const isTeamLoginView = authModal.type === 'teamLoginView';
    const isTeamLoginAdmin = authModal.type === 'teamLoginAdmin';
    const isAdminMode = authModal.type === 'adminMode';
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100]">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
          <h2 className="text-xl font-bold text-white mb-2 text-center">
            {isAdminMode ? '관리자 모드 진입' : isTeamLoginView ? '일반 팀원 입장' : (isTeamLoginAdmin ? '팀 관리자 입장' : '권한 확인')}
          </h2>
          {isAdminMode && <p className="text-sm text-slate-400 text-center mb-6">{activeTeam?.name}의 관리자 비밀번호를 입력하세요.</p>}
          {(isTeamLoginView || isTeamLoginAdmin) && <p className="text-sm text-slate-400 text-center mb-6">{authModal.targetTeam?.name}의 {isTeamLoginAdmin ? '관리자' : '일반'} 비밀번호를 입력하세요.</p>}
          <form onSubmit={handleAuthSubmit} className="space-y-4"><input type="password" name="password" required placeholder="비밀번호" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none text-center tracking-widest font-mono text-lg" autoFocus /><div className="flex gap-2 pt-2"><button type="button" onClick={() => setAuthModal({isOpen: false, type: '', targetTeam: null})} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button><button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">확인</button></div></form>
        </div>
      </div>
    );
  };

  const renderRoleSelectModal = () => {
    if (!roleSelectModal.isOpen || !roleSelectModal.team) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100] animate-in fade-in zoom-in-95">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
          <div className="flex justify-between items-center mb-6"><h2 className="text-lg font-bold text-white">어떤 권한으로 입장하시겠어요?</h2><button onClick={() => setRoleSelectModal({ isOpen: false, team: null })} className="text-slate-400 hover:text-white"><X size={20}/></button></div>
          <div className="space-y-3">
            <button onClick={() => { setAuthModal({ isOpen: true, type: 'teamLoginView', targetTeam: roleSelectModal.team }); setRoleSelectModal({ isOpen: false, team: null }); }} className="w-full bg-slate-900 border border-slate-700 hover:border-slate-500 p-4 rounded-xl flex items-center gap-4 transition text-left group"><div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center text-xl shrink-0 group-hover:bg-slate-700 transition">👁️</div><div><div className="text-white font-bold mb-1">일반 팀원 (조회 모드)</div><div className="text-xs text-slate-400">기록을 열람하고 전술판을 사용합니다.</div></div></button>
            <button onClick={() => { setAuthModal({ isOpen: true, type: 'teamLoginAdmin', targetTeam: roleSelectModal.team }); setRoleSelectModal({ isOpen: false, team: null }); }} className="w-full bg-blue-500/10 border border-blue-500/30 hover:border-blue-500/60 p-4 rounded-xl flex items-center gap-4 transition text-left group"><div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center text-xl shrink-0 transition">✍️</div><div><div className="text-blue-400 font-bold mb-1">팀 관리자 (기록 모드)</div><div className="text-xs text-blue-400/70">명단을 관리하고 경기 결과를 기록합니다.</div></div></button>
          </div>
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
          <form onSubmit={async (e) => { e.preventDefault(); if(isProcessing) return; setIsProcessing(true); try { const newTeamId = 't' + Date.now(); const newTeam = { id: newTeamId, name: e.target.teamName.value, password: e.target.password.value, adminPassword: e.target.adminPassword.value, logo: newTeamLogo || '⚽' }; await setDoc(doc(db, 'teams', newTeamId), newTeam); setIsCreateTeamOpen(false); setNewTeamLogo(null); } finally { setIsProcessing(false); } }} className="space-y-4">
            <div className="flex flex-col items-center mb-4"><div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center text-3xl border border-slate-700 overflow-hidden mb-2 relative group cursor-pointer">{newTeamLogo?.startsWith('data:image') ? <img src={newTeamLogo} alt="logo" className="w-full h-full object-cover" /> : newTeamLogo || '⚽'}<input type="file" accept="image/*" onChange={async (e) => { if (e.target.files && e.target.files[0]) setNewTeamLogo(await resizeImage(e.target.files[0], 200, 200)); }} className="absolute inset-0 opacity-0 cursor-pointer" /></div></div>
            <div><label className="block text-xs font-bold text-slate-400 mb-1">팀 이름</label><input type="text" name="teamName" required className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" /></div>
            <div><label className="block text-xs font-bold text-slate-400 mb-1">팀 비밀번호 (일반 팀원용)</label><input type="text" name="password" required className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" /></div>
            <div><label className="block text-xs font-bold text-slate-400 mb-1">팀 관리자 비밀번호 (임원진용)</label><input type="text" name="adminPassword" required className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" /></div>
            <div className="flex gap-2 pt-4"><button type="button" onClick={() => setIsCreateTeamOpen(false)} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button><button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">생성하기</button></div>
          </form>
        </div>
      </div>
    );
  };

  const renderEditTeamModal = () => {
    if (!editTeamModal.isOpen || !editTeamModal.team) return null; const team = editTeamModal.team;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100]">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl">
          <h2 className="text-xl font-bold text-white mb-6 text-center">팀 정보 수정</h2>
          <form onSubmit={async (e) => { e.preventDefault(); if(isProcessing) return; setIsProcessing(true); try { const updatedTeam = { ...team, name: e.target.teamName.value, password: e.target.password.value, adminPassword: e.target.adminPassword.value, logo: editTeamLogo || team.logo }; await setDoc(doc(db, 'teams', updatedTeam.id), updatedTeam); setEditTeamModal({ isOpen: false, team: null }); setSystemAlert({ isOpen: true, message: '팀 정보가 수정되었습니다.' }); } finally { setIsProcessing(false); } }} className="space-y-4">
            <div className="flex flex-col items-center mb-4"><div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center text-3xl border border-slate-700 overflow-hidden mb-2 relative group cursor-pointer">{(editTeamLogo || team.logo)?.startsWith('data:image') ? <img src={editTeamLogo || team.logo} alt="logo" className="w-full h-full object-cover" /> : editTeamLogo || team.logo}<input type="file" accept="image/*" onChange={async (e) => { if (e.target.files && e.target.files[0]) setEditTeamLogo(await resizeImage(e.target.files[0], 200, 200)); }} className="absolute inset-0 opacity-0 cursor-pointer" /></div></div>
            <div><label className="block text-xs font-bold text-slate-400 mb-1">팀 이름</label><input type="text" name="teamName" required defaultValue={team.name} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" /></div>
            <div><label className="block text-xs font-bold text-slate-400 mb-1">팀 비밀번호</label><input type="text" name="password" required defaultValue={team.password} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" /></div>
            <div><label className="block text-xs font-bold text-slate-400 mb-1">팀 관리자 비밀번호</label><input type="text" name="adminPassword" required defaultValue={team.adminPassword} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" /></div>
            <div className="flex gap-2 pt-4"><button type="button" onClick={() => setEditTeamModal({isOpen: false, team: null})} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button><button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">수정 완료</button></div>
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
            <div><label className="block text-xs font-bold text-slate-400 mb-1">새 마스터 비밀번호</label><input type="text" name="newAdminPwd" required className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" /></div>
            <div className="flex gap-2 pt-4"><button type="button" onClick={() => setAdminPwdChangeModal(false)} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button><button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">변경 완료</button></div>
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
          <form onSubmit={async (e) => { e.preventDefault(); if(isProcessing) return; setIsProcessing(true); try { const fd = new FormData(e.target); const updatedTeam = { ...activeTeam, name: fd.get('name'), password: fd.get('password'), adminPassword: fd.get('teamAdminPassword'), logo: teamSettingsLogo || activeTeam.logo }; await setDoc(doc(db, 'teams', activeTeamId), updatedTeam); setTeamSettingsModal(false); setSystemAlert({isOpen: true, message: '팀 설정이 성공적으로 저장되었습니다.'}); } finally { setIsProcessing(false); } }} className="space-y-4">
            <div className="flex flex-col items-center mb-4"><div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center text-3xl border border-slate-700 overflow-hidden mb-2 relative group cursor-pointer">{(teamSettingsLogo || activeTeam?.logo)?.startsWith('data:image') ? <img src={teamSettingsLogo || activeTeam?.logo} alt="logo" className="w-full h-full object-cover" /> : teamSettingsLogo || activeTeam?.logo}<input type="file" accept="image/*" onChange={async (e) => { if (e.target.files && e.target.files[0]) setTeamSettingsLogo(await resizeImage(e.target.files[0], 200, 200)); }} className="absolute inset-0 opacity-0 cursor-pointer" /></div></div>
            <div><label className="block text-xs font-bold text-slate-400 mb-1">팀 이름</label><input type="text" name="name" required defaultValue={activeTeam?.name} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" /></div>
            <div><label className="block text-xs font-bold text-slate-400 mb-1">일반 팀원 비밀번호</label><input type="text" name="password" required defaultValue={activeTeam?.password} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" /></div>
            <div><label className="block text-xs font-bold text-slate-400 mb-1">팀 관리자 비밀번호</label><input type="text" name="teamAdminPassword" required defaultValue={activeTeam?.adminPassword} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" /></div>
            <div className="flex gap-2 pt-4 border-t border-slate-700"><button type="button" onClick={() => setTeamSettingsModal(false)} className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-bold">취소</button><button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">저장하기</button></div>
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
          <div className="flex justify-between items-center mb-6"><h2 className="text-lg font-bold text-white flex items-center gap-2"><Target size={18}/> 토큰 정보 수정</h2><button onClick={() => setTokenEditModal({isOpen: false, token: null})} className="text-slate-400 hover:text-white"><X size={20}/></button></div>
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.target); const pos = fd.get('position'); const name = fd.get('name'); const newTokens = (tacticTokens||[]).map(t => t.id === tokenEditModal.token.id ? { ...t, position: pos, name: name } : t); saveHistory(newTokens); setTokenEditModal({ isOpen: false, token: null }); }} className="space-y-4">
            <div><label className="block text-xs font-bold text-slate-400 mb-1">포지션 약어</label><input type="text" name="position" defaultValue={tokenEditModal.token.position || ''} maxLength="3" placeholder="예: FW, CM" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none text-center font-black tracking-wider uppercase" /></div>
            <div><label className="block text-xs font-bold text-slate-400 mb-1">선수 이름표 (선택)</label><input type="text" name="name" defaultValue={tokenEditModal.token.name || ''} placeholder="예: 손흥민" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none text-center font-bold" /></div>
            <div className="flex gap-2 pt-2 border-t border-slate-700"><button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold">수정 완료</button></div>
            <button type="button" onClick={() => { const newTokens = (tacticTokens||[]).filter(t => t.id !== tokenEditModal.token.id); saveHistory(newTokens); setTokenEditModal({ isOpen: false, token: null }); }} className="w-full py-3 mt-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-bold text-sm flex items-center justify-center gap-1"><Trash2 size={16}/> 이 선수 토큰 삭제</button>
          </form>
        </div>
      </div>
    );
  };

  const renderShareModal = () => {
    if (!shareModal.isOpen) return null;
    const isMobileDevice = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    return (
      <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[200] p-4 animate-in fade-in">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl text-center flex flex-col items-center relative">
          {shareModal.step === 1 ? (
            <><div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div><h2 className="text-lg font-bold text-white mb-2">공유용 파일 생성 중...</h2><p className="text-xs text-slate-400">잠시만 기다려 주세요.</p></>
          ) : (
            <>
              <button onClick={() => setShareModal({ isOpen: false, step: 1, data: null, file: null, imgUrl: null, isVideo: false })} className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"><X size={20}/></button>
              <div className="w-full bg-slate-900 rounded-2xl p-2 mb-4 border border-slate-700 h-64 overflow-y-auto overscroll-contain flex flex-col items-center justify-center relative shadow-inner">
                {shareModal.isVideo ? ( <video src={shareModal.imgUrl} controls autoPlay loop playsInline className="max-h-full w-auto mx-auto rounded-xl shadow-lg border border-slate-700" /> ) : ( <img src={shareModal.imgUrl} alt="preview" className="w-full h-auto rounded-xl shadow-lg border border-slate-700" /> )}
              </div>
              <h2 className="text-base font-bold text-white mb-2 w-full flex items-center justify-center gap-2"><CheckCircle size={18} className="text-green-400"/> 파일 생성 완료! ({shareModal.file?.name})</h2>
              <p className="text-[11px] text-slate-400 mb-5 leading-relaxed">
                {isMobileDevice ? '공유하기를 눌러 카카오톡 등으로 바로 전송하거나 파일로 저장할 수 있습니다.' : 'PC에서는 파일을 저장한 뒤 카카오톡 채팅창으로 끌어다 놓아(드래그) 공유할 수 있습니다.'}
              </p>
              <div className="flex w-full gap-2.5">
                <button onClick={() => setShareModal({ isOpen: false, step: 1, data: null, file: null, imgUrl: null, isVideo: false })} className="px-4 py-3.5 bg-slate-700 text-slate-200 rounded-xl font-bold text-xs hover:bg-slate-600 transition shrink-0">닫기</button>
                <button onClick={downloadShareFile} className="flex-1 py-3.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-500 transition shadow-lg flex items-center justify-center gap-1.5">💾 파일 저장</button>
                {isMobileDevice && (
                  <button onClick={doActualShare} className="flex-1 py-3.5 bg-blue-500 text-white rounded-xl font-bold text-xs hover:bg-blue-400 transition shadow-lg flex items-center justify-center gap-1.5"><Share2 size={15}/> 공유하기</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderDateMemoModal = () => {
    if (!dateMemoModal.isOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100] animate-in fade-in zoom-in-95">
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl max-h-[80vh] flex flex-col">
          <div className="flex justify-between items-center mb-4 shrink-0 border-b border-slate-700 pb-4"><h2 className="text-lg font-bold text-white flex items-center gap-2"><Calendar size={18}/> {dateMemoModal.dateStr} 일정</h2><button onClick={() => setDateMemoModal({ isOpen: false, dateStr: null, matches: [], memo: '' })} className="text-slate-400 hover:text-white"><X size={20}/></button></div>
          <div className="flex-1 overflow-y-auto pr-1 space-y-4 hide-scrollbar">
             {dateMemoModal.matches.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-500">예정/종료된 경기</h3>
                  {dateMemoModal.matches.map(m => {
                    const badge = getMatchResultBadge(m);
                    const matchTitle = m.matchType === 'external' ? (m.opponentName || '상대팀') : m.matchType === 'futsal' ? `${m.teamCount || 2}팀 풋살` : `${m.teamCount || 2}팀 자체전`;
                    return (
                      <div key={m.id} className="bg-slate-900 p-3.5 rounded-xl border border-slate-700 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${m.status === 'completed' ? 'bg-slate-700 text-slate-300' : 'bg-blue-500/20 text-blue-400'}`}>
                            {m.status === 'completed' ? '종료' : '예정'}
                          </span>
                          <span className="text-sm font-black text-white break-all">{matchTitle}</span>
                        </div>
                        <div className="text-xs text-slate-400 break-all">
                          {formatTimeAmPm(m.time)} / {m.location}
                        </div>
                        {badge && (
                          <div className="pt-0.5">
                            <span className={`inline-block text-[11px] font-black px-2 py-0.5 rounded border ${badge.className}`}>
                              {badge.label}{badge.detail ? ` (${badge.detail})` : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
             ) : ( <div className="text-sm text-slate-500 text-center py-4">이 날짜에 등록된 경기가 없습니다.</div> )}
             <div className="pt-2 border-t border-slate-700">
                <h3 className="text-xs font-bold text-slate-500 mb-2">날짜 메모 (관리자 전용)</h3>
                {isAdmin ? (
                   <form onSubmit={(e) => { e.preventDefault(); saveMemo(dateMemoModal.dateStr, e.target.memoContent.value); setDateMemoModal(prev => ({...prev, isOpen: false})); }}>
                      <textarea name="memoContent" defaultValue={typeof dateMemoModal.memo === 'string' ? dateMemoModal.memo : ''} placeholder="이 날짜에 대한 메모를 남겨보세요." className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none resize-none h-24 text-sm" />
                      <button type="submit" className="w-full mt-3 py-3 bg-blue-500 text-white rounded-xl font-bold text-sm">메모 저장</button>
                   </form>
                ) : (
                   <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl min-h-[60px] text-sm text-white whitespace-pre-wrap">{(typeof dateMemoModal.memo === 'string' && dateMemoModal.memo) ? dateMemoModal.memo : <span className="text-slate-500 italic">등록된 메모가 없습니다.</span>}</div>
                )}
             </div>
          </div>
        </div>
      </div>
    );
  };

  const renderHiddenCaptureArea = () => {
    if (!shareModal.isOpen || !shareModal.data || shareModal.isVideo) return null; const shareMatch = shareModal.data;
    return (
      <div className="fixed top-0 left-0 w-[960px] opacity-0 pointer-events-none z-[-100] overflow-visible">
        <div id="capture-area-hidden" className="bg-slate-900 p-12 w-full flex flex-col items-center text-left text-slate-200 border-none pb-16">
          <div className="mb-8 w-full pb-6 border-b border-slate-700"><h3 className="font-black text-white text-5xl leading-tight mb-4">{shareMatch.matchType === 'external' ? `[교류전] vs ${shareMatch.opponentName}` : shareMatch.matchType === 'futsal' ? `[풋살] ${shareMatch.location}` : `[자체전] ${shareMatch.location}`}</h3><p className="text-slate-400 text-2xl font-medium">{new Date(shareMatch.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} {formatTimeAmPm(shareMatch.time)} · 참석 {(shareMatch.attendees || []).length}명</p></div>
          <div className="w-full bg-slate-800 rounded-3xl p-8 mb-8 border border-slate-700/50 shadow-md"><div className="font-black text-slate-400 text-2xl border-b border-slate-700/50 pb-4 mb-6">순위표 {shareMatch.isTournament && <span className="text-yellow-400 text-lg ml-2">(토너먼트 룰 적용)</span>}</div><StandingsTable match={shareMatch} isLarge={true} /></div>
          <div className="w-full mb-8 grid grid-cols-2 gap-8">
                {shareMatch.isTournament ? (() => {
                  let elements = [];
                  for (let setNum = 1; setNum <= 3; setNum++) {
                    const setQuarters = [1, 2, 3, 4].map(i => (setNum - 1) * 4 + i); const playedInSet = (shareMatch.quarterScores || []).filter(qs => setQuarters.includes(qs.quarter));
                    if (playedInSet.length === 0) { elements.push( <div key={`set-${setNum}`} className="bg-slate-800/30 rounded-3xl p-8 border border-slate-700/50 border-dashed col-span-2 flex justify-center items-center py-12"><span className="text-slate-500 font-bold text-2xl">{setNum}세트 전체 - 미진행 (조기종료)</span></div> ); } 
                    else {
                      setQuarters.forEach(qNum => {
                        const qs = playedInSet.find(q => q.quarter === qNum);
                        if (qs) {
                          const qLogs = (shareMatch.logs || []).filter(l => l.quarter === qs.quarter); const { title } = getTournamentQuarterInfo(qs.quarter);
                          elements.push(
                            <div key={qs.quarter} className="w-full bg-slate-800 rounded-3xl p-8 border border-slate-700/50 shadow-md">
                               <div className="flex flex-col items-center border-b border-slate-700/50 pb-6 mb-6"><span className="font-black text-blue-400 text-2xl mb-3">{title}</span><span className="font-black text-white text-3xl text-center flex items-center justify-center w-full"><span className={`${TEAM_TEXT_COLORS[qs.team1]} flex-1 text-right`}>{getTeamDisplayName(shareMatch, qs.team1)}</span> <span className="text-slate-500 mx-5 shrink-0">{qs.score1} : {qs.score2}</span> <span className={`${TEAM_TEXT_COLORS[qs.team2]} flex-1 text-left`}>{getTeamDisplayName(shareMatch, qs.team2)}</span></span></div>
                               <div className="space-y-6">
                                 {qLogs.length > 0 ? qLogs.map(l => {
                                   const isLeft = l.teamLetter === qs.team1;
                                   return ( <div key={l.id} className={`flex items-start gap-5 w-full ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}><span className="text-slate-500 text-xl w-16 shrink-0 text-center mt-1">{l.time}</span><div className={`flex flex-col ${isLeft ? 'items-start' : 'items-end'}`}><div className="text-slate-100 font-bold text-2xl flex items-center gap-2"><span className={TEAM_TEXT_COLORS[l.teamLetter]}>⚽</span> {l.scorerName}{l.isPK && <span className="text-base bg-red-500/20 text-red-400 px-2 py-1 rounded ml-2 border border-red-500/30">PK</span>}</div>{l.remark && <div className="text-lg bg-slate-900/80 px-4 py-2 rounded-lg text-slate-300 mt-2 inline-block border border-slate-700/50">{l.remark}</div>}{l.assistName && ( <div className="text-slate-500 mt-2 flex items-center gap-2"><Footprints size={20} className="text-slate-500"/> <span className="text-xl">{l.assistName}</span></div> )}</div></div> )
                                 }) : <div className="text-xl text-slate-500 text-center py-6 italic">득점 기록이 없습니다.</div>}
                               </div>
                            </div>
                          );
                        } else { elements.push( <div key={`q-${qNum}`} className="bg-slate-800/30 rounded-3xl p-6 border border-slate-700/50 border-dashed flex justify-center items-center"><span className="text-slate-500 font-bold text-xl">{getTournamentQuarterInfo(qNum).title} - 미진행</span></div> ); }
                      });
                    }
                  } return elements;
               })() : (
                 (shareMatch.quarterScores || []).length > 0 ? (shareMatch.quarterScores || []).map(qs => {
                   const qLogs = (shareMatch.logs || []).filter(l => l.quarter === qs.quarter);
                   return (
                     <div key={qs.quarter} className="w-full bg-slate-800 rounded-3xl p-8 border border-slate-700/50 shadow-md">
                        <div className="flex flex-col items-center border-b border-slate-700/50 pb-6 mb-6"><span className="font-black text-blue-400 text-2xl mb-3">{qs.quarter}Q</span><span className="font-black text-white text-3xl text-center flex items-center justify-center w-full"><span className={`${TEAM_TEXT_COLORS[qs.team1]} flex-1 text-right`}>{getTeamDisplayName(shareMatch, qs.team1)}</span> <span className="text-slate-500 mx-5 shrink-0">{qs.score1} : {qs.score2}</span> <span className={`${TEAM_TEXT_COLORS[qs.team2]} flex-1 text-left`}>{getTeamDisplayName(shareMatch, qs.team2)}</span></span></div>
                        <div className="space-y-6">
                          {qLogs.length > 0 ? qLogs.map(l => {
                            const isLeft = l.teamLetter === qs.team1;
                            return ( <div key={l.id} className={`flex items-start gap-5 w-full ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}><span className="text-slate-500 text-xl w-16 shrink-0 text-center mt-1">{l.time}</span><div className={`flex flex-col ${isLeft ? 'items-start' : 'items-end'}`}><div className="text-slate-100 font-bold text-2xl flex items-center gap-2"><span className={TEAM_TEXT_COLORS[l.teamLetter]}>⚽</span> {l.scorerName}{l.isPK && <span className="text-base bg-red-500/20 text-red-400 px-2 py-1 rounded ml-2 border border-red-500/30">PK</span>}</div>{l.remark && <div className="text-lg bg-slate-900/80 px-4 py-2 rounded-lg text-slate-300 mt-2 inline-block border border-slate-700/50">{l.remark}</div>}{l.assistName && <div className="text-slate-500 mt-2 flex items-center gap-2"><Footprints size={20} className="text-slate-500"/> <span className="text-xl">{l.assistName}</span></div>}</div></div> )
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
                {TEAM_LETTERS.slice(0, getMatchTeamCount(shareMatch)).map(teamLetter => {
                  const teamPlayers = players.filter(p => (shareMatch.attendees || []).includes(p.id) && ((shareMatch.teamAssignments || {})[p.id]) === teamLetter);
                  if(teamPlayers.length === 0) return null;
                  return (
                    <div key={teamLetter}>
                      <div className={`text-xl font-black mb-4 ${TEAM_TEXT_COLORS[teamLetter]}`}>{getTeamDisplayName(shareMatch, teamLetter)}</div>
                      <div className="flex flex-wrap gap-4">{teamPlayers.map(p => ( <div key={p.id} className="bg-slate-900 px-5 py-3 rounded-full border border-slate-600/50 flex items-center"><span className="font-bold text-white text-xl tracking-wide">{p.name}</span></div> ))}</div>
                    </div>
                  );
                })}
              </div>
          </div>
        </div>
      </div>
    );
  };

  const renderInstallGuideModal = () => {
    if (!installGuideModal) return null;
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isKakao = /KAKAOTALK/i.test(ua);
    const isAndroid = /Android/i.test(ua);

    const handleOpenExternalBrowser = () => {
      const currentUrl = window.location.href;
      if (isKakao && isAndroid) {
        window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(currentUrl)}`;
      } else {
        window.open(currentUrl, '_blank');
      }
    };

    const handleCopyUrl = async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setSystemAlert({ isOpen: true, message: '주소가 복사되었습니다!\nSafari 또는 크롬 주소창에 붙여넣어 접속해주세요.' });
      } catch {
        setSystemAlert({ isOpen: true, message: `아래 주소를 복사해 브라우저에서 열어주세요:\n${window.location.href}` });
      }
    };

    const handleDirectInstall = async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredInstallPrompt(null);
        setInstallGuideModal(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-[200] animate-in fade-in zoom-in-95">
        <div className="bg-slate-800 p-5 sm:p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-2xl max-h-[88vh] flex flex-col relative">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 text-sm">📲</span>
              앱 아이콘 설치 가이드
            </h2>
            <button onClick={() => setInstallGuideModal(false)} className="text-slate-400 hover:text-white p-1"><X size={20}/></button>
          </div>

          <div className="flex-1 overflow-y-auto pr-0.5 space-y-4 hide-scrollbar">
            {/* 카카오톡 인앱브라우저 안내 배너 */}
            <div className={`rounded-2xl p-3.5 border ${isKakao ? 'bg-amber-500/15 border-amber-500/40' : 'bg-slate-900/90 border-slate-700/80'}`}>
              <div className="flex items-start gap-2.5">
                <span className="text-base shrink-0 mt-0.5">💬</span>
                <div className="text-xs leading-relaxed text-slate-300">
                  {isKakao ? (
                    <span className="font-bold text-amber-300 block mb-1">현재 카카오톡 인앱브라우저로 접속 중입니다!</span>
                  ) : (
                    <span className="font-bold text-amber-400 block mb-1">카카오톡 채팅방 링크로 열었을 때 필독!</span>
                  )}
                  카카오톡 안에서 열린 화면에서는 홈 화면 아이콘 추가가 제한됩니다. 먼저 <strong className="text-white">외부 기본 브라우저(크롬 / 삼성인터넷 / Safari)</strong>로 전환한 뒤 설치해주세요.
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                {isAndroid && (
                  <button
                    type="button"
                    onClick={handleOpenExternalBrowser}
                    className="flex-1 py-2.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl transition flex items-center justify-center gap-1 shadow"
                  >
                    <ArrowUpRight size={14} className="shrink-0"/> 외부 브라우저로 바로 열기
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1"
                >
                  🔗 주소 복사하기
                </button>
              </div>
            </div>

            {/* 크롬/삼성인터넷 등에서 PWA 즉시 설치가 가능한 경우 */}
            {deferredInstallPrompt && (
              <button
                type="button"
                onClick={handleDirectInstall}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-black text-xs rounded-2xl shadow-lg flex items-center justify-center gap-2 transition"
              >
                <span>⚡</span> 지금 바로 바탕화면에 앱 설치하기
              </button>
            )}

            {/* 기기 OS 선택 탭 */}
            <div className="grid grid-cols-2 bg-slate-900 p-1 rounded-xl border border-slate-700/80 gap-1">
              <button
                type="button"
                onClick={() => setInstallGuideTab('android')}
                className={`py-2 rounded-lg text-xs font-bold transition ${installGuideTab === 'android' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                🤖 안드로이드 (갤럭시)
              </button>
              <button
                type="button"
                onClick={() => setInstallGuideTab('ios')}
                className={`py-2 rounded-lg text-xs font-bold transition ${installGuideTab === 'ios' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                🍎 아이폰 (iOS)
              </button>
            </div>

            {/* 단계별 안내 */}
            {installGuideTab === 'android' ? (
              <div className="space-y-2.5">
                <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-3.5 flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">1</div>
                  <div className="text-xs leading-relaxed text-slate-300">
                    <div className="font-bold text-white mb-0.5">카카오톡에서 외부 브라우저로 열기</div>
                    카톡 화면 우측 하단(또는 우측 상단)의 <strong className="text-amber-400">⋮ (점 3개)</strong> 버튼 터치 → <strong className="text-white">[다른 브라우저로 열기]</strong>를 선택하세요.
                    <div className="text-[11px] text-slate-400 mt-1">* 위 노란색 <strong className="text-amber-300">[외부 브라우저로 바로 열기]</strong> 버튼을 누르면 바로 이동됩니다.</div>
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-3.5 flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">2</div>
                  <div className="text-xs leading-relaxed text-slate-300">
                    <div className="font-bold text-white mb-0.5">브라우저 메뉴 버튼 터치</div>
                    • <strong className="text-emerald-400">크롬(Chrome)</strong>: 우측 상단 <strong className="text-white">⋮ (점 3개)</strong> 터치<br/>
                    • <strong className="text-blue-400">삼성 인터넷</strong>: 우측 하단 <strong className="text-white">≡ (줄 3개)</strong> 터치 (또는 주소창 옆 <strong className="text-white">＋</strong> 아이콘)
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-3.5 flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">3</div>
                  <div className="text-xs leading-relaxed text-slate-300">
                    <div className="font-bold text-white mb-0.5">앱 설치 / 홈 화면에 추가</div>
                    • <strong className="text-emerald-400">크롬</strong>: 메뉴에서 <strong className="text-white">[앱 설치]</strong> 또는 <strong className="text-white">[홈 화면에 추가]</strong> 선택<br/>
                    • <strong className="text-blue-400">삼성 인터넷</strong>: <strong className="text-white">[현재 페이지 추가] → [홈 화면]</strong> 선택 후 추가하면 바탕화면에 앱 아이콘이 생성됩니다!
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-3.5 flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">1</div>
                  <div className="text-xs leading-relaxed text-slate-300">
                    <div className="font-bold text-white mb-0.5">카카오톡에서 Safari로 열기</div>
                    카톡 화면 우측 하단의 <strong className="text-amber-400">[📤 공유 아이콘]</strong>(네모에서 화살표가 위로 나오는 모양) 터치 → <strong className="text-white">[Safari로 열기]</strong>를 선택하세요.
                    <div className="text-[11px] text-slate-400 mt-1">* 또는 위 <strong className="text-slate-200">[주소 복사하기]</strong>를 눌러 <strong className="text-white">Safari 앱</strong> 주소창에 붙여넣어 이동하세요.</div>
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-3.5 flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">2</div>
                  <div className="text-xs leading-relaxed text-slate-300">
                    <div className="font-bold text-white mb-0.5">Safari 하단 [공유] 버튼 터치</div>
                    Safari 브라우저로 페이지가 열렸다면, 화면 하단 중앙에 있는 <strong className="text-blue-400">[📤 공유 버튼]</strong>(네모 위 화살표)을 눌러주세요.
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-3.5 flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">3</div>
                  <div className="text-xs leading-relaxed text-slate-300">
                    <div className="font-bold text-white mb-0.5">[홈 화면에 추가] 선택</div>
                    공유 메뉴를 살짝 위로 올려 <strong className="text-white">[홈 화면에 추가 ➕]</strong>를 누른 뒤, 우측 상단 <strong className="text-emerald-400">[추가]</strong>를 누르면 아이폰 바탕화면에 앱 아이콘이 생성됩니다!
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setInstallGuideModal(false)}
            className="w-full mt-4 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl text-sm transition shrink-0"
          >
            확인했어요
          </button>
        </div>
      </div>
    );
  };

  if (appState === 'login') {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-200 font-sans p-6 flex flex-col justify-center max-w-md mx-auto relative">
        {globalStyles}
        <div className="absolute top-6 left-6 right-6 flex justify-between items-center">
          <button onClick={() => setInstallGuideModal(true)} className="text-xs text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 rounded-lg hover:bg-emerald-500/20 transition flex items-center gap-1.5 font-bold shadow-sm">
            <span>📲</span> 앱 설치 가이드
          </button>
          {!isLoginAdminMode ? ( <button onClick={() => setAuthModal({ isOpen: true, type: 'loginAdminAuth' })} className="text-xs text-slate-400 border border-slate-700 bg-slate-800 px-3 py-1.5 rounded-lg hover:text-white transition flex items-center gap-1"><Shield size={14}/> 관리자 설정</button> ) : ( <button onClick={() => setIsLoginAdminMode(false)} className="text-xs text-red-400 border border-red-500/30 bg-red-500/10 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition flex items-center gap-1"><LogOut size={14}/> 관리자 종료</button> )}
        </div>
        <div className="text-center mb-10 mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex justify-center mb-5"><div className="relative"><div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 rounded-full animate-pulse"></div><div className="w-16 h-16 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl flex items-center justify-center shadow-lg relative z-10"><Activity size={32} className="text-blue-500" /></div></div></div>
          <h1 className="text-4xl font-black tracking-tighter mb-3 bg-gradient-to-r from-white via-blue-100 to-slate-400 text-transparent bg-clip-text">MATCHBOARD</h1>
          <p className="text-slate-400 text-sm font-medium tracking-wide">승리를 기록하는 가장 스마트한 방법</p>
          {isLoginAdminMode && <div className="mt-5 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs py-2 px-4 rounded-xl font-bold inline-block animate-pulse">시스템 관리자 모드 활성화됨</div>}
        </div>
        <div className="space-y-4 mb-6">
          <h2 className="text-sm font-bold text-slate-500 px-2">{isLoginAdminMode ? '등록된 팀 관리' : '내 팀 선택하기'}</h2>
          {!isLoaded ? ( <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div></div> ) : teams.length === 0 && !isLoginAdminMode ? ( <div className="text-center py-10 bg-slate-800/50 rounded-2xl border border-slate-700 text-sm text-slate-500 animate-in fade-in">등록된 팀이 없습니다.<br/>우측 상단의 <strong className="text-slate-400">관리자 설정</strong>에서<br/>새로운 팀을 생성해 주세요.</div> ) : (
            <div className="space-y-4 animate-in fade-in">
              {teams.map(team => (
                <div key={team.id} className="relative group">
                  <button onClick={() => { if (!isLoginAdminMode) { setActiveTeamId(team.id); setIsAdmin(false); setAppState('main'); } }} className={`w-full bg-slate-800 hover:bg-slate-700 p-4 rounded-2xl border border-slate-700 flex items-center gap-4 transition text-left ${isLoginAdminMode ? 'cursor-default' : 'cursor-pointer'}`}>
                    <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center text-2xl border border-slate-600 overflow-hidden shrink-0 bg-white/5">{team.logo?.startsWith('data:image') ? <img src={team.logo} alt={team.name} className="w-full h-full object-cover" /> : team.logo}</div>
                    <div className="flex-1"><div className="font-bold text-white text-lg">{team.name}</div><div className="text-xs text-slate-400">{isLoginAdminMode ? `관리자 비밀번호: ${team.adminPassword || team.password}` : '터치하여 바로 입장'}</div></div>
                    {!isLoginAdminMode && <ChevronRight className="text-slate-500" />}
                  </button>
                  {isLoginAdminMode && ( <div className="absolute top-1/2 -translate-y-1/2 right-4 flex gap-2"><button onClick={() => { setEditTeamLogo(team.logo); setEditTeamModal({ isOpen: true, team }); }} className="p-2 bg-slate-700 text-slate-300 rounded-lg hover:text-white transition shadow-sm"><Edit size={16}/></button><button onClick={() => requestDeleteTeam(team.id)} className="p-2 bg-slate-700 text-slate-300 rounded-lg hover:text-red-400 transition shadow-sm"><Trash2 size={16}/></button></div> )}
                </div>
              ))}
            </div>
          )}
        </div>
        {!isLoginAdminMode && (
          <button
            onClick={() => setInstallGuideModal(true)}
            className="w-full bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 rounded-2xl p-3.5 flex items-center justify-between gap-3 transition text-left mb-4 group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-lg shrink-0">
                📲
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                  바탕화면에 앱 아이콘 설치하기
                </div>
                <div className="text-[11px] text-slate-400 truncate mt-0.5">
                  카톡 링크 접속 시 홈 화면에 추가하는 방법 안내
                </div>
              </div>
            </div>
            <span className="text-[11px] font-bold text-slate-300 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-700 group-hover:border-emerald-500/40 group-hover:text-emerald-300 transition shrink-0">
              가이드 보기
            </span>
          </button>
        )}
        {isLoginAdminMode && (
          <div className="space-y-3">
            <button onClick={() => { setNewTeamLogo(null); setIsCreateTeamOpen(true); }} className="w-full py-4 border-2 border-dashed border-slate-700 rounded-2xl text-blue-400 font-bold flex items-center justify-center gap-2 hover:border-blue-500 bg-blue-500/5 transition"><Plus size={20} /> 새 팀 생성하기</button>
            <button onClick={() => setAdminPwdChangeModal(true)} className="w-full py-4 border-2 border-dashed border-slate-700 rounded-2xl text-slate-400 font-bold flex items-center justify-center gap-2 hover:text-white hover:border-slate-500 bg-slate-800/50 transition"><Shield size={20} /> 관리자 마스터 비밀번호 변경</button>
          </div>
        )}
        {renderInstallGuideModal()}{renderCreateTeamModal()}{renderEditTeamModal()}{renderAdminPwdChangeModal()}{renderRoleSelectModal()}{renderAuthModal()}{renderSystemModals()}
      </div>
    );
  }

  if (appState === 'liveMatch' && liveMatch) {
    const activeTeams = liveState.playingTeams; const isExternal = liveMatch.matchType === 'external';
    const { teamPlayers: t1GkCandidates, otherPlayers: t1GkOthers } = getTeamCandidatePlayers(liveMatch, activeTeams[0]);
    const { teamPlayers: t2GkCandidates, otherPlayers: t2GkOthers } = getTeamCandidatePlayers(liveMatch, activeTeams[1]);
    return (
      <div className="bg-slate-900 text-slate-200 font-sans p-5 sm:p-6 max-w-md mx-auto relative flex flex-col h-[100dvh] overflow-hidden animate-in fade-in">
        {globalStyles}
        <header className="flex justify-between items-center mb-6 pt-2 shrink-0 gap-2">
          <button onClick={() => setAppState('main')} className="flex items-center gap-1 text-slate-400 hover:text-white font-bold text-sm shrink-0"><ChevronLeft size={20}/> 메인</button>
          <h2 className="text-base sm:text-lg font-black text-white truncate">{!liveState.isQuarterActive ? "새 쿼터 준비" : `${liveState.currentQuarter}Q 라이브`}</h2>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={handleManualRefresh} disabled={isRefreshing} className="text-xs bg-slate-800 text-emerald-400 px-2.5 py-1.5 rounded-lg font-bold border border-emerald-500/30 flex items-center gap-1 hover:bg-slate-700 transition whitespace-nowrap"><RotateCcw size={13} className={isRefreshing ? 'animate-spin' : ''}/> 새로고침</button>
            {!isExternal && <button onClick={() => setAssignmentModal({isOpen: true, match: liveMatch})} className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1.5 rounded-lg font-bold border border-slate-600 flex items-center gap-1 hover:bg-slate-700 transition whitespace-nowrap"><Users size={13}/> 편성</button>}
            <button onClick={() => triggerShare(liveMatch)} className="text-xs bg-yellow-500/20 text-yellow-500 px-2.5 py-1.5 rounded-lg font-bold border border-yellow-500/30 flex items-center gap-1 hover:bg-yellow-500/30 transition whitespace-nowrap"><Share2 size={13}/> 공유</button>
          </div>
        </header>

        {!liveState.isQuarterActive ? (
          <>
            <div className="flex-1 flex flex-col justify-center pb-4 overflow-y-auto hide-scrollbar animate-in fade-in slide-in-from-bottom-4 duration-500">
              {liveMatch.isTournament && <div className="text-center text-yellow-400 font-bold mb-2 text-sm">{getTournamentQuarterInfo(liveState.currentQuarter).title} 대진표 자동 배정됨</div>}
              <h2 className="text-3xl font-black text-center text-white mb-2">{liveState.currentQuarter}Q 매치업</h2>
              <p className="text-center text-slate-400 mb-6">이번 쿼터에 맞붙을 팀과 골키퍼를 확인하세요.</p>
              {isExternal ? (
                <div className="flex items-center justify-center gap-4 mb-6"><div className="w-32 border-2 text-white font-black text-xl text-center py-6 rounded-2xl shadow-xl bg-slate-800 border-slate-400">{activeTeam?.name || '우리 팀'}</div><span className="text-slate-600 font-black italic text-2xl">VS</span><div className={`w-32 border-2 text-white font-black text-xl text-center py-6 rounded-2xl shadow-xl ${TEAM_COLORS['B']}`}>{liveMatch.opponentName}</div></div>
              ) : (
                <div className="flex items-center justify-center gap-4 mb-6">
                  <select value={liveState.playingTeams[0]} onChange={(e) => { const nt = e.target.value; updateLiveStateAndSync({ playingTeams: [nt, liveState.playingTeams[1]], gk1: getLastGkForTeam(liveMatch, nt) }); }} className={`w-28 border-2 text-white font-black text-3xl text-center py-5 rounded-2xl appearance-none shadow-xl outline-none ${liveState.playingTeams[0] === 'A' ? 'bg-slate-800 border-slate-400' : TEAM_COLORS[liveState.playingTeams[0]]}`}>{TEAM_LETTERS.slice(0, getMatchTeamCount(liveMatch)).map(t => <option key={t} value={t} className="bg-slate-900">{t}팀</option>)}</select>
                  <span className="text-slate-600 font-black italic text-2xl">VS</span>
                  <select value={liveState.playingTeams[1]} onChange={(e) => { const nt = e.target.value; updateLiveStateAndSync({ playingTeams: [liveState.playingTeams[0], nt], gk2: getLastGkForTeam(liveMatch, nt) }); }} className={`w-28 border-2 text-white font-black text-3xl text-center py-5 rounded-2xl appearance-none shadow-xl outline-none ${liveState.playingTeams[1] === 'A' ? 'bg-slate-800 border-slate-400' : TEAM_COLORS[liveState.playingTeams[1]]}`}>{TEAM_LETTERS.slice(0, getMatchTeamCount(liveMatch)).map(t => <option key={t} value={t} className="bg-slate-900">{t}팀</option>)}</select>
                </div>
              )}
              <div className={`grid ${isExternal ? 'grid-cols-1' : 'grid-cols-2'} gap-3 mb-6 bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700/70`}>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1.5">🧤 {getTeamDisplayName(liveMatch, activeTeams[0])} 골키퍼</label>
                  <select value={liveState.gk1 || 'none'} onChange={(e) => updateLiveStateAndSync({ gk1: e.target.value === 'none' ? null : e.target.value })} className="w-full bg-slate-900 border border-slate-700 p-2.5 rounded-xl text-white text-xs font-bold outline-none">
                    <option value="none">미지정 (선택안함)</option>
                    <option value="mercenary">👤 용병</option>
                    <optgroup label="소속/참석 선수">{t1GkCandidates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
                    {t1GkOthers.length > 0 && <optgroup label="타팀 지원">{t1GkOthers.map(p => <option key={p.id} value={p.id}>({(liveMatch.teamAssignments || {})[p.id] ? `${liveMatch.teamAssignments[p.id]}팀` : '미정'}) {p.name}</option>)}</optgroup>}
                  </select>
                </div>
                {!isExternal && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1.5">🧤 {getTeamDisplayName(liveMatch, activeTeams[1])} 골키퍼</label>
                    <select value={liveState.gk2 || 'none'} onChange={(e) => updateLiveStateAndSync({ gk2: e.target.value === 'none' ? null : e.target.value })} className="w-full bg-slate-900 border border-slate-700 p-2.5 rounded-xl text-white text-xs font-bold outline-none">
                      <option value="none">미지정 (선택안함)</option>
                      <option value="mercenary">👤 용병</option>
                      <optgroup label="소속/참석 선수">{t2GkCandidates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
                      {t2GkOthers.length > 0 && <optgroup label="타팀 지원">{t2GkOthers.map(p => <option key={p.id} value={p.id}>({(liveMatch.teamAssignments || {})[p.id] ? `${liveMatch.teamAssignments[p.id]}팀` : '미정'}) {p.name}</option>)}</optgroup>}
                    </select>
                  </div>
                )}
              </div>
              <button onClick={() => { if (liveState.playingTeams[0] === liveState.playingTeams[1]) { setSystemAlert({isOpen:true, message:'서로 다른 팀을 선택해주세요.'}); return; } updateLiveStateAndSync({ isQuarterActive: true }); }} className="w-full bg-blue-500 hover:bg-blue-400 text-white font-black py-4 rounded-xl text-xl shadow-lg transition">쿼터 시작하기</button>
              <button onClick={() => endQuarter(true)} className="w-full bg-slate-800 text-slate-400 hover:text-white font-bold py-3 rounded-xl mt-3 text-sm transition border border-slate-700">경기 조기 종료</button>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-t-3xl border-t border-slate-700/50 -mx-5 -mb-5 sm:-mx-6 sm:-mb-6 mt-auto">
               <h3 className="text-[11px] font-bold text-slate-400 mb-3 ml-2 flex items-center gap-1.5"><Activity size={12}/> {liveState.currentQuarter - 1 > 0 ? '이전 쿼터 결과' : '첫 쿼터 준비 중'}</h3>
               <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2 px-2">
                  {(liveMatch.quarterScores || []).map(qs => ( <div key={qs.quarter} className="flex-shrink-0 bg-slate-900 border border-slate-700 rounded-xl p-3 flex flex-col items-center justify-center min-w-[140px]"><div className="text-[10px] font-black text-slate-500 mb-2 bg-slate-800 px-2.5 py-0.5 rounded-full">{qs.quarter}Q</div><div className="flex items-center justify-between w-full gap-2"><div className="flex flex-col items-center w-0 flex-1"><span className={`text-[10px] font-bold whitespace-nowrap mb-0.5 ${TEAM_TEXT_COLORS[qs.team1]}`}>{getTeamDisplayName(liveMatch, qs.team1)}</span><span className="text-white font-black text-xl leading-none">{qs.score1}</span></div><div className="text-slate-600 font-black text-xs pb-1 shrink-0">:</div><div className="flex flex-col items-center w-0 flex-1"><span className={`text-[10px] font-bold whitespace-nowrap mb-0.5 ${TEAM_TEXT_COLORS[qs.team2]}`}>{getTeamDisplayName(liveMatch, qs.team2)}</span><span className="text-white font-black text-xl leading-none">{qs.score2}</span></div></div></div> )).reverse()}
               </div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-slate-800 rounded-3xl p-5 mb-5 border border-slate-700 shadow-xl relative overflow-hidden shrink-0">
              <div className={`absolute top-0 left-0 w-1/2 h-1.5 bg-current ${TEAM_TEXT_COLORS[activeTeams[0]]}`}></div><div className={`absolute top-0 right-0 w-1/2 h-1.5 bg-current ${TEAM_TEXT_COLORS[activeTeams[1]]}`}></div>
              <div className="flex justify-between items-center">
                <div className="text-center w-[42%]">
                  <div className={`font-black text-[13px] mb-1 truncate ${TEAM_TEXT_COLORS[activeTeams[0]]}`}>{getTeamDisplayName(liveMatch, activeTeams[0])}</div>
                  <div className="text-5xl font-black text-white">{(liveMatch.logs || []).filter(l => l.quarter === liveState.currentQuarter && l.teamLetter === activeTeams[0]).length}</div>
                  <div className="mt-2">
                    <select value={liveState.gk1 || 'none'} onChange={(e) => updateLiveStateAndSync({ gk1: e.target.value === 'none' ? null : e.target.value })} className="w-full bg-slate-900/90 border border-slate-700 px-2 py-1 rounded-lg text-[11px] font-bold text-slate-300 outline-none text-center">
                      <option value="none">🧤 GK 미지정</option>
                      <option value="mercenary">🧤 GK: 용병</option>
                      <optgroup label="소속/참석 선수">{t1GkCandidates.map(p => <option key={p.id} value={p.id}>🧤 GK: {p.name}</option>)}</optgroup>
                      {t1GkOthers.length > 0 && <optgroup label="타팀 지원">{t1GkOthers.map(p => <option key={p.id} value={p.id}>🧤 GK: {p.name}</option>)}</optgroup>}
                    </select>
                  </div>
                </div>
                <div className="text-xl font-black text-slate-600 italic">VS</div>
                <div className="text-center w-[42%]">
                  <div className={`font-black text-[13px] mb-1 truncate ${TEAM_TEXT_COLORS[activeTeams[1]]}`}>{getTeamDisplayName(liveMatch, activeTeams[1])}</div>
                  <div className="text-5xl font-black text-white">{(liveMatch.logs || []).filter(l => l.quarter === liveState.currentQuarter && l.teamLetter === activeTeams[1]).length}</div>
                  {!isExternal ? (
                    <div className="mt-2">
                      <select value={liveState.gk2 || 'none'} onChange={(e) => updateLiveStateAndSync({ gk2: e.target.value === 'none' ? null : e.target.value })} className="w-full bg-slate-900/90 border border-slate-700 px-2 py-1 rounded-lg text-[11px] font-bold text-slate-300 outline-none text-center">
                        <option value="none">🧤 GK 미지정</option>
                        <option value="mercenary">🧤 GK: 용병</option>
                        <optgroup label="소속/참석 선수">{t2GkCandidates.map(p => <option key={p.id} value={p.id}>🧤 GK: {p.name}</option>)}</optgroup>
                        {t2GkOthers.length > 0 && <optgroup label="타팀 지원">{t2GkOthers.map(p => <option key={p.id} value={p.id}>🧤 GK: {p.name}</option>)}</optgroup>}
                      </select>
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] text-slate-500 py-1 font-bold">상대팀</div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-4 mb-6 shrink-0">
              <button onClick={() => setGoalFlow({ isOpen: true, step: 1, matchId: null, quarter: null, teamLetter: activeTeams[0], scorer: null, isPK: false, remark: '', isMissingAdd: false })} className={`flex-1 border-2 py-6 rounded-3xl flex flex-col items-center justify-center gap-2 transition shadow-lg ${activeTeams[0] === 'A' ? 'bg-slate-800 border-slate-400 text-white' : TEAM_COLORS[activeTeams[0]]}`}><Trophy size={28} className="fill-current"/><span className="font-black text-sm">{getTeamDisplayName(liveMatch, activeTeams[0])} 득점</span></button>
              <button onClick={() => setGoalFlow({ isOpen: true, step: 1, matchId: null, quarter: null, teamLetter: activeTeams[1], scorer: null, isPK: false, remark: '', isMissingAdd: false })} className={`flex-1 border-2 py-6 rounded-3xl flex flex-col items-center justify-center gap-2 transition shadow-lg ${activeTeams[1] === 'A' ? 'bg-slate-800 border-slate-400 text-white' : TEAM_COLORS[activeTeams[1]]}`}><Trophy size={28} className="fill-current"/><span className="font-black text-sm">{getTeamDisplayName(liveMatch, activeTeams[1])} 득점</span></button>
            </div>
            <div className="flex-1 bg-slate-800/40 border border-slate-700/50 rounded-3xl p-4 sm:p-5 pb-8 overflow-y-auto flex flex-col gap-4 hide-scrollbar">
              <div className="flex justify-between items-center mb-2 shrink-0"><h3 className="text-sm font-bold text-slate-400 flex items-center gap-2"><List size={16}/> 쿼터별 기록 현황</h3><button onClick={requestEndQuarter} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold text-xs transition border border-slate-600 shadow-sm">현재 쿼터 종료</button></div>
              {(liveMatch.quarterScores || []).map(qs => (
                <div key={qs.quarter} className="bg-slate-900 rounded-2xl p-4 border border-slate-800 mb-2 shrink-0">
                   <div className="relative flex justify-center items-center border-b border-slate-800 pb-3 mb-3"><span className="absolute left-0 font-bold text-slate-500 text-sm">{qs.quarter}Q</span><span className="font-bold text-white text-[15px] flex items-center"><span className={TEAM_TEXT_COLORS[qs.team1]}>{getTeamDisplayName(liveMatch, qs.team1)}</span><span className="text-slate-500 mx-3">{qs.score1} : {qs.score2}</span><span className={TEAM_TEXT_COLORS[qs.team2]}>{getTeamDisplayName(liveMatch, qs.team2)}</span></span><button onClick={() => setQuarterEditModal({isOpen: true, match: liveMatch, quarterScore: qs})} className="absolute right-0 text-slate-500 hover:text-white p-1 bg-slate-800 rounded-md transition"><Edit size={14}/></button></div>
                   {renderQuarterGkBadge(liveMatch, qs)}
                   {renderQuarterLogsBlock(liveMatch, qs, true)}
                   <div className="flex justify-center gap-2 mt-4 pt-3 border-t border-slate-800/50">
                     <button onClick={() => setGoalFlow({ isOpen: true, step: 1, matchId: liveMatch.id, quarter: qs.quarter, teamLetter: qs.team1, availableTeams: [qs.team1, qs.team2], scorer: null, isPK: false, remark: '', isMissingAdd: true })} className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 px-3 py-1.5 rounded-lg flex items-center gap-1 transition"><Plus size={14}/> {getTeamDisplayName(liveMatch, qs.team1)} 득점 추가</button>
                     <button onClick={() => setGoalFlow({ isOpen: true, step: 1, matchId: liveMatch.id, quarter: qs.quarter, teamLetter: qs.team2, availableTeams: [qs.team1, qs.team2], scorer: null, isPK: false, remark: '', isMissingAdd: true })} className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 px-3 py-1.5 rounded-lg flex items-center gap-1 transition"><Plus size={14}/> {getTeamDisplayName(liveMatch, qs.team2)} 득점 추가</button>
                   </div>
                </div>
              ))}
              <div className="bg-slate-900 rounded-2xl p-4 border border-blue-500/30 shadow-lg relative overflow-hidden shrink-0">
                 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-transparent"></div>
                 <div className="relative flex justify-center items-center border-b border-slate-800 pb-3 mb-4"><span className="absolute left-0 font-black text-blue-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> {liveState.currentQuarter}Q</span><span className="font-bold text-white text-[15px]"><span className={TEAM_TEXT_COLORS[activeTeams[0]]}>{getTeamDisplayName(liveMatch, activeTeams[0])}</span><span className="text-slate-500 mx-3">{(liveMatch.logs || []).filter(l => l.quarter === liveState.currentQuarter && l.teamLetter === activeTeams[0]).length} : {(liveMatch.logs || []).filter(l => l.quarter === liveState.currentQuarter && l.teamLetter === activeTeams[1]).length}</span><span className={TEAM_TEXT_COLORS[activeTeams[1]]}>{getTeamDisplayName(liveMatch, activeTeams[1])}</span></span></div>
                 {renderQuarterLogsBlock(liveMatch, { quarter: liveState.currentQuarter, team1: activeTeams[0] }, true)}
              </div>
              <div className="h-6 shrink-0 w-full"></div>
            </div>
          </>
        )}
        {renderAssignmentModal()}{renderShareModal()}{renderHiddenCaptureArea()}{renderGoalFlowModal()}{renderLogEditModal()}{renderQuarterEditModal()}{renderSystemModals()}
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-900 text-slate-200 font-sans pb-24 max-w-md mx-auto relative shadow-xl flex flex-col">
      {globalStyles}
      <header className="px-6 py-4 border-b border-slate-800 bg-slate-900 sticky top-0 z-[60] flex justify-between items-center shrink-0" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center border border-slate-700 text-lg overflow-hidden shrink-0">{activeTeam?.logo?.startsWith('data:image') ? <img src={activeTeam?.logo} alt="logo" className="w-full h-full object-cover" /> : activeTeam?.logo}</div>
          <div>
            <h1 className="text-lg font-black text-white italic tracking-tight">MATCHBOARD</h1>
            <div className="text-[10px] text-slate-500 flex items-center gap-2"><span className={isAdmin ? "text-blue-400 font-bold" : ""}>{activeTeam?.name} {isAdmin ? '(관리자)' : '(조회모드)'}</span>{isAdmin && <button onClick={() => { setTeamSettingsLogo(activeTeam?.logo); setTeamSettingsModal(true); }} className="text-slate-400 hover:text-white transition"><Settings size={12}/></button>}</div>
          </div>
        </div>
        <div className="flex gap-2">
           {!isAdmin && <button onClick={() => setAuthModal({isOpen: true, type: 'adminMode'})} className="text-[10px] font-bold bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-700">관리자 모드</button>}
           {isAdmin && <button onClick={() => setIsAdmin(false)} className="text-[10px] font-bold bg-blue-500/20 text-blue-400 px-3 py-1.5 rounded-lg border border-blue-500/30 hover:bg-blue-500/30">조회모드 전환</button>}
           <button onClick={logout} className="text-[10px] font-bold bg-red-500/10 text-red-400 px-3 py-1.5 rounded-lg border border-red-500/20 hover:bg-red-500/20">로그아웃</button>
        </div>
      </header>

      <main className="p-6 flex-1 flex flex-col min-h-0">
        {activeTab === 'matches' && (
          <div className="space-y-6 animate-in fade-in flex-1 overflow-y-auto hide-scrollbar">
            <div className="flex justify-between items-center mb-2"><h2 className="text-xl font-black text-white">팀 경기</h2>{isAdmin && ( <button onClick={() => openMatchModal(null)} className="bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 shadow-lg hover:bg-blue-600 transition"><Plus size={16}/> 새 경기</button> )}</div>
            {monthlyMatches.length === 0 && (
               <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 text-center shadow-lg mb-4">
                   <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-700 shadow-inner"><Trophy size={28} className="text-slate-500"/></div>
                   <h3 className="text-white font-bold text-lg mb-2">등록된 경기가 없습니다.</h3>
                   <p className="text-slate-400 text-sm mb-6 max-w-[240px] mx-auto">새로운 경기를 생성하여<br/>승리의 순간을 기록해보세요!</p>
                   <div className="flex justify-center gap-3"><button onClick={() => setActiveTab('roster')} className="bg-slate-700 hover:bg-slate-600 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition">명단 먼저 확인</button>{isAdmin && <button onClick={() => openMatchModal(null)} className="bg-blue-500 hover:bg-blue-400 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition shadow-lg flex items-center gap-1"><Plus size={16}/> 새 경기 추가</button>}</div>
               </div>
            )}
            <div className="flex justify-between items-center bg-slate-800 p-3 rounded-2xl border border-slate-700"><button onClick={prevMonth} className="p-2 text-slate-400 hover:text-white"><ChevronLeft size={20}/></button><h3 className="text-lg font-black text-white">{viewDate.getFullYear()}년 {viewDate.getMonth() + 1}월</h3><button onClick={nextMonth} className="p-2 text-slate-400 hover:text-white"><ChevronRight size={20}/></button></div>
            <div className="space-y-4 mt-4">
              {scheduledThisMonth.map(m => (
                <div key={m.id} className="bg-slate-800 p-5 rounded-2xl border border-blue-500/30 relative overflow-hidden group">
                  {checkCanEdit(m) && ( <div className="absolute top-3 right-3 flex gap-2"><button onClick={() => openMatchModal(m)} className="text-slate-400 hover:text-white p-1"><Edit size={16}/></button>{isAdmin && <button onClick={() => requestDeleteMatch(m.id)} className="text-slate-400 hover:text-red-400 p-1"><Trash2 size={16}/></button>}</div> )}
                  <div className="flex items-center gap-2 text-sm text-blue-400 font-bold mb-2"><span className="bg-blue-500/20 px-2 py-0.5 rounded text-[10px]">예정</span> {m.date} {formatTimeAmPm(m.time)}</div>
                  {m.matchType !== 'external' && (() => {
                      const attendees = m.attendees || []; const assignments = m.teamAssignments || {}; const unassigned = attendees.filter(id => !assignments[id]);
                      if (attendees.length === 0) return <div className="text-[11px] bg-slate-800 text-slate-400 px-2 py-1 rounded inline-block mb-2 border border-slate-700">👥 아직 참석자가 없습니다</div>;
                      if (unassigned.length > 0) return <div className="text-[11px] bg-red-500/10 text-red-400 px-2 py-1 rounded inline-block mb-2 border border-red-500/20 animate-pulse">⚠️ 팀 편성 필요 ({unassigned.length}명 미정)</div>;
                      return <div className="text-[11px] bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded inline-block mb-2 border border-emerald-500/20">✅ 팀 편성 완료</div>;
                  })()}
                  <div className="flex items-center gap-2 mb-1 mt-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${m.matchType === 'external' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : m.matchType === 'futsal' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'}`}>{m.matchType === 'external' ? '교류전' : m.matchType === 'futsal' ? '풋살' : '자체전'}</span>
                    {m.isTournament && <span className="text-[10px] font-bold bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded border border-yellow-500/30">토너먼트</span>}
                    <div className="text-lg font-bold text-white">{m.location}</div>
                  </div>
                  <div className="text-xs text-slate-400 mb-4 mt-1">{m.matchType === 'external' ? `우리 팀 VS ${m.opponentName}` : `총 ${m.teamCount || 2}팀 파전`} • 총 {m.totalQuarters}쿼터 • 참석 {(m.attendees || []).length}명</div>
                  <div className="flex gap-2">
                    {m.matchType !== 'external' && <button onClick={() => handleActionClick('assign', m)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl text-sm flex justify-center items-center gap-2 transition"><Users size={16}/> 편성</button>}
                    <button onClick={() => handleActionClick('start', m)} className={`bg-blue-500 text-white font-bold py-3 rounded-xl text-sm flex justify-center items-center gap-2 shadow-lg hover:bg-blue-600 transition ${m.matchType === 'external' ? 'w-full' : 'flex-1'}`}>{(m.logs || []).length > 0 ? <Activity size={16}/> : <Play size={16} className="fill-current"/>} {(m.logs || []).length > 0 ? '이어하기' : '기록 시작'}</button>
                  </div>
                </div>
              ))}
              {completedThisMonthWithStandings.map(m => (
                <div key={m.id} onClick={() => { setDetailModalMatchId(m.id); setDetailModal({isOpen: true, match: m}); }} className="bg-slate-900 p-5 rounded-2xl border border-slate-700 opacity-80 hover:opacity-100 hover:border-slate-500 cursor-pointer transition relative group">
                  <div className="absolute top-3 right-3 flex gap-2 items-center"><button onClick={(e) => { e.stopPropagation(); triggerShare(m); }} className="text-yellow-500 hover:text-yellow-400 p-1 bg-slate-800 rounded-md ml-1"><Share2 size={14}/></button>{isAdmin && <button onClick={(e) => { e.stopPropagation(); requestDeleteMatch(m.id); }} className="text-slate-500 hover:text-red-400 p-1 bg-slate-800 rounded-md ml-1"><Trash2 size={14}/></button>}</div>
                  <div className="flex items-center gap-2 text-sm text-slate-400 font-bold mb-2"><CheckCircle size={14}/> {m.date} (종료)</div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${m.matchType === 'external' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : m.matchType === 'futsal' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'}`}>{m.matchType === 'external' ? '교류전' : m.matchType === 'futsal' ? '풋살' : '자체전'}</span>
                    {m.isTournament && <span className="text-[10px] font-bold bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded border border-yellow-500/30">토너먼트</span>}
                    <div className="text-base font-bold text-slate-300">{m.location}</div>
                  </div>
                  <div className="bg-slate-800 rounded-xl p-3 mb-3 border border-slate-700/50">
                    <div className="text-xs text-slate-400 mb-2 font-bold border-b border-slate-700 pb-2 flex justify-between"><span>순위표</span><span className="text-blue-400 font-normal">상세보기 &gt;</span></div>
                    <StandingsTable match={m} isLarge={false} />
                  </div>
                  <div className="mb-3">
                    <div className="flex justify-between items-center text-xs text-slate-400 mb-2 font-bold px-1"><span>쿼터별 스코어 보드</span></div>
                    <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2 cursor-grab active:cursor-grabbing" onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; }}>
                      {(m.quarterScores || []).map(qs => (
                        <div key={qs.quarter} className="flex-shrink-0 bg-slate-900 border border-slate-700/50 rounded-xl p-3 flex flex-col items-center justify-center shadow-inner min-w-[150px]">
                          <div className="text-[10px] font-black text-slate-500 mb-3 bg-slate-800 px-3 py-1 rounded-full">{qs.quarter}Q</div>
                          <div className="flex items-center justify-between w-full px-2 gap-3"><div className="flex flex-col items-center flex-1 w-0"><span className={`text-[11px] font-bold text-center whitespace-nowrap mb-1 ${TEAM_TEXT_COLORS[qs.team1]}`}>{getTeamDisplayName(m, qs.team1)}</span><span className="text-white font-black text-2xl leading-none">{qs.score1}</span></div><div className="text-slate-600 font-black text-sm pb-1 shrink-0">:</div><div className="flex flex-col items-center flex-1 w-0"><span className={`text-[11px] font-bold text-center whitespace-nowrap mb-1 ${TEAM_TEXT_COLORS[qs.team2]}`}>{getTeamDisplayName(m, qs.team2)}</span><span className="text-white font-black text-2xl leading-none">{qs.score2}</span></div></div>
                        </div>
                      ))}
                      {(m.quarterScores || []).length === 0 && <div className="text-xs text-slate-600 px-1">기록 없음</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {}
        {activeTab === 'schedule' && (
          <div className="space-y-6 animate-in fade-in flex-1 overflow-y-auto hide-scrollbar">
            <h2 className="text-xl font-black text-white">팀 스케쥴</h2>
            <div className="flex justify-between items-center bg-slate-800 p-3 rounded-2xl border border-slate-700">
              <button onClick={prevMonth} className="p-2 text-slate-400 hover:text-white"><ChevronLeft size={20}/></button>
              <h3 className="text-lg font-black text-white">{viewDate.getFullYear()}년 {viewDate.getMonth() + 1}월</h3>
              <button onClick={nextMonth} className="p-2 text-slate-400 hover:text-white"><ChevronRight size={20}/></button>
            </div>
            <div className="bg-slate-800 rounded-2xl p-2 sm:p-4 border border-slate-700 shadow-sm">
                <div className="grid grid-cols-7 gap-1 text-center mb-2">{['일', '월', '화', '수', '목', '금', '토'].map((d, i) => <div key={d} className={`text-[10px] font-bold ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-500'}`}>{d}</div>)}</div>
                <div className="grid grid-cols-7 gap-1">
                  {(() => {
                    const year = viewDate.getFullYear(); const month = viewDate.getMonth(); const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const days = [];
                    for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="p-2" />);
                    for (let day = 1; day <= daysInMonth; day++) {
                      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const dayMatches = matchesByDate[dateStr] || [];
                      const dayOfWeek = new Date(year, month, day).getDay();
                      days.push(
                        <div key={day} onClick={() => setDateMemoModal({ isOpen: true, dateStr, matches: dayMatches, memo: memos[dateStr] || '' })} className="p-1 min-h-[82px] border border-slate-700/50 rounded-lg relative flex flex-col bg-slate-800/30 cursor-pointer hover:bg-slate-800 transition">
                          <span className={`text-[10px] font-bold text-center mb-1 ${dayOfWeek === 0 ? 'text-red-400' : dayOfWeek === 6 ? 'text-blue-400' : 'text-slate-400'}`}>{day}</span>
                          <div className="flex flex-col gap-1 w-full flex-1 justify-start">
                            {dayMatches.map((m, idx) => {
                              const badge = getMatchResultBadge(m);
                              const label = m.matchType === 'external' ? (m.opponentName || '상대팀') : m.matchType === 'futsal' ? '풋살' : '자체전';
                              return (
                                <div key={idx} className={`w-full rounded px-0.5 py-0.5 border text-center flex flex-col items-center justify-center gap-0.5 ${m.status === 'completed' ? 'bg-slate-900/80 border-slate-700/80 text-slate-300' : 'bg-blue-500/10 border-blue-500/30 text-blue-300'}`}>
                                  <span className="w-full text-[9px] sm:text-[10px] font-black leading-[1.15] break-all whitespace-normal">{label}</span>
                                  {badge && (
                                    <span className={`text-[8px] sm:text-[9px] font-black px-1 py-0.2 rounded border leading-tight ${badge.color}`}>
                                      {badge.label}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                            {memos[dateStr] && <div className="w-full text-center text-[9px] sm:text-[10px] font-bold text-yellow-500 leading-tight break-all whitespace-normal mt-0.5 bg-yellow-500/10 rounded px-0.5 py-0.5">{memos[dateStr]}</div>}
                          </div>
                        </div>
                      );
                    }
                    return days;
                  })()}
                </div>
            </div>

            <div className="mt-6 space-y-4">
                <h3 className="text-sm font-bold text-slate-400 px-1 border-b border-slate-800 pb-2">이달의 일정 목록</h3>
                {monthlyMatches.length === 0 ? (
                    <div className="text-center py-6 text-slate-600 text-sm">일정이 없습니다.</div>
                ) : (
                    monthlyMatches.sort((a,b) => a.date.localeCompare(b.date)).map(m => {
                        const badge = getMatchResultBadge(m);
                        return (
                        <div key={m.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 relative group flex flex-col">
                           <div className="flex items-start gap-3">
                               <div className="flex flex-col items-center justify-center bg-slate-900 w-12 h-12 rounded-lg border border-slate-700 shrink-0"><span className="text-[10px] text-slate-500">{m.date.split('-')[1]}월</span><span className="text-lg font-black text-white">{m.date.split('-')[2]}</span></div>
                               <div className="flex-1 min-w-0 pt-0.5">
                                   <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                     <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${m.status === 'completed' ? 'bg-slate-700 text-slate-400' : 'bg-blue-500/20 text-blue-400'}`}>{m.status === 'completed' ? '종료' : '예정'}</span>
                                     {badge && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border shrink-0 ${badge.color}`}>{badge.text}{badge.score ? ` (${badge.score})` : ''}</span>}
                                     <span className="text-sm font-bold text-white break-all">{m.location}</span>
                                   </div>
                                   <div className="text-[11px] text-slate-400 break-all">{formatTimeAmPm(m.time)} • {m.matchType === 'external' ? `vs ${m.opponentName}` : m.matchType === 'futsal' ? `${m.teamCount || 2}팀 풋살` : `${m.teamCount || 2}팀 자체전`}</div>
                               </div>
                               {isAdmin && ( <label className="text-slate-400 hover:text-white p-2 cursor-pointer bg-slate-700 rounded-lg border border-slate-600 transition shrink-0" onClick={e => e.stopPropagation()}><Plus size={16}/><input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleUploadPhotos(e, m.id)} /></label> )}
                           </div>
                           
                           {(m.photos || []).length > 0 && (
                              <div className="mt-4 pt-4 border-t border-slate-700">
                                 <div className="flex flex-col gap-2">
                                    <div className="w-full aspect-video rounded-xl overflow-hidden relative cursor-pointer border border-slate-600 shadow-md hover:opacity-90 transition bg-slate-900" onClick={(e) => { e.stopPropagation(); setGalleryModal({ isOpen: true, photos: m.photos, currentIndex: 0, matchId: m.id }); }}>
                                       <img src={m.photos[0].url} alt="main-photo" className="w-full h-full object-cover" />
                                       {m.photos.length > 1 && ( <div className="absolute bottom-3 right-3 bg-black/70 text-white text-[11px] font-black px-3 py-1.5 rounded-full backdrop-blur-sm">+{m.photos.length - 1}장 더보기</div> )}
                                    </div>
                                    {m.photos.length > 1 && (
                                       <div className="grid grid-cols-4 gap-2">
                                          {m.photos.slice(1, 5).map((photo, pIdx) => (
                                             <div key={photo.id} className="aspect-square rounded-lg overflow-hidden cursor-pointer border border-slate-600 hover:opacity-80 transition bg-slate-900" onClick={(e) => { e.stopPropagation(); setGalleryModal({ isOpen: true, photos: m.photos, currentIndex: pIdx + 1, matchId: m.id }); }}>
                                                <img src={photo.url} alt="sub-photo" className="w-full h-full object-cover" />
                                             </div>
                                          ))}
                                       </div>
                                    )}
                                 </div>
                              </div>
                           )}
                        </div>
                        );
                    })
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
            {filteredStats.filter(s => s.caps > 0 || s.gkQuarters > 0).length === 0 ? (
              <div className="text-center py-10 text-slate-500 border border-slate-800 rounded-2xl text-sm">해당 기간에 종료된 경기 데이터가 없습니다.</div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="bg-slate-800 rounded-2xl p-3.5 border border-slate-700 flex flex-col items-center text-center shadow-sm overflow-hidden">
                    <span className="text-[11px] font-black text-slate-300 mb-1.5">{titlePrefix} 득점왕</span><span className="text-2xl mb-1">⚽</span>
                    <span className="text-[13px] font-black text-white leading-tight mb-0.5" style={{wordBreak: 'keep-all'}}>{topScorers.length===0?'없음':topScorers.length===1?topScorers[0].name:`${topScorers[0].name} 외 ${topScorers.length-1}명`}</span><span className="text-xs font-bold text-blue-400">{maxGoals > 0 ? `${maxGoals}골` : ''}</span>
                  </div>
                  <div className="bg-slate-800 rounded-2xl p-3.5 border border-slate-700 flex flex-col items-center text-center shadow-sm overflow-hidden">
                    <span className="text-[11px] font-black text-slate-300 mb-1.5">{titlePrefix} 도움왕</span><span className="text-2xl mb-1">👟</span>
                    <span className="text-[13px] font-black text-white leading-tight mb-0.5" style={{wordBreak: 'keep-all'}}>{topAssists.length===0?'없음':topAssists.length===1?topAssists[0].name:`${topAssists[0].name} 외 ${topAssists.length-1}명`}</span><span className="text-xs font-bold text-blue-400">{maxAssists > 0 ? `${maxAssists}도움` : ''}</span>
                  </div>
                  <div className="bg-slate-800 rounded-2xl p-3.5 border border-slate-700 flex flex-col items-center text-center shadow-sm overflow-hidden">
                    <span className="text-[11px] font-black text-slate-300 mb-1.5">{titlePrefix} 거미손</span><span className="text-2xl mb-1">🧤</span>
                    <span className="text-[13px] font-black text-white leading-tight mb-0.5" style={{wordBreak: 'keep-all'}}>{topGks.length===0?'없음':topGks.length===1?topGks[0].name:`${topGks[0].name} 외 ${topGks.length-1}명`}</span><span className="text-xs font-bold text-emerald-400">{topGks.length > 0 && topGks[0].gaRate !== null ? `실점율 ${Number(topGks[0].gaRate).toFixed(2)}` : ''}</span>
                  </div>
                  <div className="bg-slate-800 rounded-2xl p-3.5 border border-slate-700 flex flex-col items-center text-center shadow-sm overflow-hidden">
                    <span className="text-[11px] font-black text-slate-300 mb-1.5">{titlePrefix} 참석왕</span><span className="text-2xl mb-1">🔥</span>
                    <span className="text-[13px] font-black text-white leading-tight mb-0.5" style={{wordBreak: 'keep-all'}}>{topCaps.length===0?'없음':topCaps.length===1?topCaps[0].name:`${topCaps[0].name} 외 ${topCaps.length-1}명`}</span><span className="text-xs font-bold text-blue-400">{maxCaps > 0 ? `${maxCaps}회` : ''}</span>
                  </div>
                </div>
                <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 shadow-sm">
                  <div className="text-xs font-black text-slate-400 mb-3 flex items-center gap-1.5">⚽ 필드 플레이어 기록</div>
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

                <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <div className="text-xs font-black text-emerald-400 flex items-center gap-1.5">🧤 골키퍼 방어율 기록</div>
                    <span className="text-[10px] text-slate-500 font-bold">실점율 = 실점 ÷ 출전 쿼터 (낮을수록 우수)</span>
                  </div>
                  {gkStatsList.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-xs border border-slate-700/50 rounded-xl bg-slate-900/40">
                      해당 기간에 골키퍼(GK)로 지정된 쿼터 기록이 없습니다.<br/>
                      <span className="text-[11px] text-slate-600">경기 진행 중 또는 경기 상세 &gt; 쿼터 수정에서 GK를 지정해보세요!</span>
                    </div>
                  ) : (
                    <table className="w-full text-sm text-center">
                      <thead>
                        <tr className="text-slate-500 font-bold border-b border-slate-700 text-xs">
                          <th className="pb-3 text-left pl-2">선수명</th>
                          <th className="pb-3">출전(Q)</th>
                          <th className="pb-3">실점</th>
                          <th className="pb-3">클린시트</th>
                          <th className="pb-3">실점율(당)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gkStatsList.map((st, idx) => (
                          <tr key={st.id} className="border-b border-slate-700/50 last:border-0">
                            <td className="py-3 text-left pl-2 font-bold text-white flex items-center gap-1.5">
                              {idx === 0 && <span className="text-xs">🥇</span>}
                              {st.name}
                            </td>
                            <td className="py-3 text-slate-300 font-bold">{st.gkQuarters}Q</td>
                            <td className="py-3 text-red-400 font-bold">{st.goalsConceded}</td>
                            <td className="py-3 text-emerald-400 font-bold">{st.cleanSheets}회 <span className="text-[10px] text-slate-500 font-normal">({st.cleanSheetRate || 0}%)</span></td>
                            <td className="py-3 text-yellow-400 font-black">{Number(st.gaRate || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {}
        {activeTab === 'tactics' && (
          <div className="animate-in fade-in flex-1 flex flex-col min-h-0 overflow-y-auto hide-scrollbar relative pb-4 -mx-3 px-2">
            {/* 상단 통합 컨트롤 패널 */}
            <div className="bg-slate-800/70 border border-slate-700/80 rounded-2xl p-2 space-y-1.5 shrink-0 mb-2 shadow-sm overflow-hidden">
              {/* 1단: 코트 전환 + 실행취소/초기화 + 캡처/가이드 (단일 통합 바) */}
              <div className="flex items-center justify-between bg-slate-900 p-1 rounded-xl border border-slate-700/80 gap-0.5">
                <button onClick={() => { setPitchType('full'); saveHistory(getInitialTacticsTokens('full'), []); setAnimationFrames([]); setIsPlaying(false); setIsAutoRecording(false); if (playbackRef.current) cancelAnimationFrame(playbackRef.current); }} className={`flex-1 h-7 px-1.5 rounded-lg text-[11px] font-bold transition whitespace-nowrap flex items-center justify-center ${pitchType === 'full' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>풀코트</button>
                <button onClick={() => { setPitchType('half'); saveHistory(getInitialTacticsTokens('half'), []); setAnimationFrames([]); setIsPlaying(false); setIsAutoRecording(false); if (playbackRef.current) cancelAnimationFrame(playbackRef.current); }} className={`flex-1 h-7 px-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap flex items-center justify-center ${pitchType === 'half' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>하프</button>

                <div className="w-px h-3.5 bg-slate-800 mx-0.5 shrink-0"></div>

                <button onClick={() => {if(pastState.length > 0) { const prev = pastState[pastState.length - 1]; setPastState(p => p.slice(0, -1)); setFutureState(p => [{ tokens: tacticTokens || [], drawings: drawings || [] }, ...p]); setTacticTokens(prev.tokens || []); setDrawings(prev.drawings || []); }}} disabled={pastState.length === 0 || isPlaying} className="h-7 w-6 text-slate-300 rounded-lg disabled:opacity-30 hover:bg-slate-800 transition flex items-center justify-center shrink-0" title="실행 취소"><Undo size={13}/></button>
                <button onClick={() => {if(futureState.length > 0) { const next = futureState[0]; setFutureState(p => p.slice(1)); setPastState(p => [...p, { tokens: tacticTokens || [], drawings: drawings || [] }]); setTacticTokens(next.tokens || []); setDrawings(next.drawings || []); }}} disabled={futureState.length === 0 || isPlaying} className="h-7 w-6 text-slate-300 rounded-lg disabled:opacity-30 hover:bg-slate-800 transition flex items-center justify-center shrink-0" title="다시 실행"><Redo size={13}/></button>
                <button onClick={() => { setPitchType(pitchType); saveHistory(getInitialTacticsTokens(pitchType), []); setAnimationFrames([]); setIsPlaying(false); setIsAutoRecording(false); if (playbackRef.current) cancelAnimationFrame(playbackRef.current); }} className="flex-1 h-7 px-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg font-bold text-[11px] transition whitespace-nowrap flex items-center justify-center">초기화</button>

                <div className="w-px h-3.5 bg-slate-800 mx-0.5 shrink-0"></div>

                <button onClick={triggerTacticShare} className="flex-1 h-7 px-1 text-slate-200 hover:text-white hover:bg-slate-800 rounded-lg font-bold text-[11px] transition flex items-center justify-center gap-1 whitespace-nowrap"><Share2 size={11} className="text-emerald-400 shrink-0"/>캡처</button>
                <button onClick={() => setTacticsTutorialModal(true)} className="flex-1 h-7 px-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg font-bold text-[11px] transition flex items-center justify-center gap-1 whitespace-nowrap"><MessageCircle size={11} className="text-blue-400 shrink-0"/>가이드</button>
              </div>

              {/* 2단: 팀 인원 조절 (단일 슬림 바) */}
              <div className="grid grid-cols-2 bg-slate-900 rounded-xl border border-slate-700/80 divide-x divide-slate-800">
                <div className="flex items-center justify-between px-2.5 py-1 min-w-0">
                  <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5 whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>A팀 인원
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleUpdatePlayerCount('A', (tacticTokens||[]).filter(t=>t.team==='A').length - 1)} disabled={isPlaying} className="w-6 h-6 flex items-center justify-center bg-slate-800 text-slate-300 rounded-md hover:bg-slate-700 hover:text-white transition font-bold text-xs disabled:opacity-40">-</button>
                    <span className="w-5 text-center text-white text-xs font-black">{(tacticTokens||[]).filter(t=>t.team==='A').length}</span>
                    <button onClick={() => handleUpdatePlayerCount('A', (tacticTokens||[]).filter(t=>t.team==='A').length + 1)} disabled={isPlaying} className="w-6 h-6 flex items-center justify-center bg-slate-800 text-slate-300 rounded-md hover:bg-slate-700 hover:text-white transition font-bold text-xs disabled:opacity-40">+</button>
                  </div>
                </div>
                <div className="flex items-center justify-between px-2.5 py-1 min-w-0">
                  <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5 whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>B팀 인원
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleUpdatePlayerCount('B', (tacticTokens||[]).filter(t=>t.team==='B').length - 1)} disabled={isPlaying} className="w-6 h-6 flex items-center justify-center bg-slate-800 text-slate-300 rounded-md hover:bg-slate-700 hover:text-white transition font-bold text-xs disabled:opacity-40">-</button>
                    <span className="w-5 text-center text-white text-xs font-black">{(tacticTokens||[]).filter(t=>t.team==='B').length}</span>
                    <button onClick={() => handleUpdatePlayerCount('B', (tacticTokens||[]).filter(t=>t.team==='B').length + 1)} disabled={isPlaying} className="w-6 h-6 flex items-center justify-center bg-slate-800 text-slate-300 rounded-md hover:bg-slate-700 hover:text-white transition font-bold text-xs disabled:opacity-40">+</button>
                  </div>
                </div>
              </div>

              {/* 3단: 애니메이션 스튜디오 바 (녹화 / 재생 / 영상공유 / 삭제) */}
              <div className="flex items-center gap-1 bg-slate-900 rounded-xl p-1 border border-slate-700/80">
                <div className="h-7 px-2.5 rounded-lg bg-slate-800/80 text-[11px] font-black text-slate-400 flex items-center justify-center shrink-0 whitespace-nowrap">
                  {(animationFrames||[]).length}컷
                </div>
                <button onClick={() => {
                  if (!isAutoRecording) { setAnimationFrames([{ tokens: JSON.parse(JSON.stringify(tacticTokens||[])), drawings: JSON.parse(JSON.stringify(drawings||[])) }]); setIsAutoRecording(true); } 
                  else setIsAutoRecording(false);
                }} disabled={isPlaying} className={`flex-1 h-7 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-40 whitespace-nowrap ${isAutoRecording ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'}`}>
                  <span className={`w-2 h-2 rounded-full ${isAutoRecording ? 'bg-red-400' : 'bg-red-500'}`}></span>
                  <span>{isAutoRecording ? '녹화중지' : '자동녹화'}</span>
                </button>
                <button onClick={() => {
                   if ((animationFrames||[]).length < 2) return; setIsPlaying(true); let idx = 0; let start = null;
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
                }} disabled={isPlaying || (animationFrames||[]).length < 2 || isAutoRecording} className="flex-1 h-7 px-2 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 disabled:opacity-35 whitespace-nowrap">
                  <PlayCircle size={13} className="shrink-0"/> <span>재생</span>
                </button>
                <button onClick={exportAnimationToVideo} disabled={isPlaying || (animationFrames||[]).length < 2 || isAutoRecording} className="flex-1 h-7 px-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 disabled:opacity-35 whitespace-nowrap">
                  <Video size={13} className="shrink-0"/> <span>영상공유</span>
                </button>
                <button onClick={() => { setAnimationFrames([]); setIsPlaying(false); setIsAutoRecording(false); if (playbackRef.current) cancelAnimationFrame(playbackRef.current); }} disabled={isPlaying || (animationFrames||[]).length === 0} className="w-7 h-7 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg flex items-center justify-center transition disabled:opacity-35 shrink-0" title="녹화 컷 비우기">
                  <Trash2 size={13}/>
                </button>
              </div>

              {/* 4단: 드로잉 도구 탭 */}
              <div className="grid grid-cols-5 bg-slate-900 rounded-xl p-1 border border-slate-700/80 gap-1">
                <button onClick={() => setCurrentTool('move')} className={`h-8 px-1 rounded-lg flex items-center justify-center gap-1 transition whitespace-nowrap ${currentTool === 'move' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><MousePointer size={13} className="shrink-0"/><span className="text-[11px] font-bold">이동</span></button>
                <button onClick={() => setCurrentTool('arrow')} className={`h-8 px-1 rounded-lg flex items-center justify-center gap-1 transition whitespace-nowrap ${currentTool === 'arrow' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><ArrowUpRight size={13} className="shrink-0"/><span className="text-[11px] font-bold">화살표</span></button>
                <button onClick={() => setCurrentTool('pass')} className={`h-8 px-1 rounded-lg flex items-center justify-center gap-1 transition whitespace-nowrap ${currentTool === 'pass' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><TrendingUp size={13} className="shrink-0"/><span className="text-[11px] font-bold">패스</span></button>
                <button onClick={() => setCurrentTool('zone')} className={`h-8 px-1 rounded-lg flex items-center justify-center gap-1 transition whitespace-nowrap ${currentTool === 'zone' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><Square size={13} className="shrink-0"/><span className="text-[11px] font-bold">지역</span></button>
                <button onClick={() => setCurrentTool('erase')} className={`h-8 px-1 rounded-lg flex items-center justify-center gap-1 transition whitespace-nowrap ${currentTool === 'erase' ? 'bg-red-500/90 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><XCircle size={13} className="shrink-0"/><span className="text-[11px] font-bold">지우기</span></button>
              </div>
            </div>

            <div className="w-full flex justify-center items-center relative py-1 shrink-0">
              <div 
                ref={boardRef}
                style={{ maxWidth: '100%', aspectRatio: pitchType === 'full' ? '2/3' : '4/3', touchAction: (currentTool === 'move' || currentTool === 'erase' || isPlaying) ? 'pan-y' : 'none' }}
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
                    <marker id="arrowhead" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="9" refX="10" refY="4.5" orient="auto"><polygon points="0 0, 12 4.5, 0 9" fill="#FACC15" /></marker>
                    <marker id="passhead" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="9" refX="10" refY="4.5" orient="auto"><polygon points="0 0, 12 4.5, 0 9" fill="#60A5FA" /></marker>
                  </defs>
                  <line ref={svgArrowRef} stroke="#FACC15" strokeWidth="2.5" markerEnd="url(#arrowhead)" style={{display: 'none'}} />
                  <line ref={svgPassRef} stroke="#60A5FA" strokeWidth="2.5" strokeDasharray="6,6" markerEnd="url(#passhead)" style={{display: 'none'}} />
                  <rect ref={svgZoneRef} fill="rgba(59, 130, 246, 0.3)" stroke="#3B82F6" strokeWidth="2.5" style={{display: 'none'}} />
                  {(drawings||[]).filter(Boolean).map(d => {
                    const isEraseMode = currentTool === 'erase' && !isPlaying;
                    const pClass = isEraseMode ? 'pointer-events-auto cursor-pointer hover:stroke-red-500 hover:stroke-[4px]' : '';
                    if (d.type === 'arrow') return <line key={d.id} x1={`${d.start.x}%`} y1={`${d.start.y}%`} x2={`${d.end.x}%`} y2={`${d.end.y}%`} stroke="#FACC15" strokeWidth="2.5" markerEnd="url(#arrowhead)" className={pClass} onPointerDown={(e) => { if(isEraseMode){ e.stopPropagation(); setDrawings(prev => prev.filter(x => x.id !== d.id)); } }} />
                    if (d.type === 'pass') return <line key={d.id} x1={`${d.start.x}%`} y1={`${d.start.y}%`} x2={`${d.end.x}%`} y2={`${d.end.y}%`} stroke="#60A5FA" strokeWidth="2.5" strokeDasharray="6,6" markerEnd="url(#passhead)" className={pClass} onPointerDown={(e) => { if(isEraseMode){ e.stopPropagation(); setDrawings(prev => prev.filter(x => x.id !== d.id)); } }} />
                    if (d.type === 'zone') return <rect key={d.id} x={`${Math.min(d.start.x, d.end.x)}%`} y={`${Math.min(d.start.y, d.end.y)}%`} width={`${Math.abs(d.start.x - d.end.x)}%`} height={`${Math.abs(d.start.y - d.end.y)}%`} fill="rgba(59, 130, 246, 0.3)" stroke="#3B82F6" strokeWidth="3" className={isEraseMode ? 'pointer-events-auto cursor-pointer hover:fill-red-500/30' : ''} onPointerDown={(e) => { if(isEraseMode){ e.stopPropagation(); setDrawings(prev => prev.filter(x => x.id !== d.id)); } }} />
                    return null;
                  })}
                </svg>

                {(tacticTokens||[]).map(t => (
                  <div
                    key={t.id} id={`token-${t.id}`}
                    onPointerDown={(e) => {
                      if (currentTool !== 'move' || isPlaying) return;
                      e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
                      pointerDownInfo.current = { x: e.clientX, y: e.clientY, time: Date.now() };
                      dragStartTokensRef.current = [...(tacticTokens||[])];
                      setDraggingToken(t.id);
                    }}
                    style={{ left: `${t.x}%`, top: `${t.y}%`, transform: 'translate(-50%, -50%)', touchAction: 'none' }}
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
          </div>
        )}

        {activeTab === 'gps' && (
          <div className="space-y-4 animate-in fade-in flex-1 overflow-y-auto hide-scrollbar pb-6">
            {/* 상단 타이틀 및 가이드 버튼 */}
            <div className="flex justify-between items-center gap-2">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <Activity size={20} className="text-emerald-400 shrink-0"/> GPS 활동량
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">애플워치 · 갤럭시워치 히트맵 & 스프린트 분석</p>
              </div>
              <button
                type="button"
                onClick={() => setGpsGuideModal(true)}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-emerald-400 px-3 py-2 rounded-xl font-bold border border-emerald-500/30 flex items-center gap-1.5 transition shrink-0 shadow-sm"
              >
                <span>⌚</span> 워치 연동법
              </button>
            </div>

            {/* 측정 / 파일 불러오기 액션 컨트롤 카드 */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-3.5 space-y-2.5 shadow-sm">
              <div className="grid grid-cols-2 gap-2">
                <label className="cursor-pointer bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-black text-xs py-3 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-md transition text-center">
                  <span>📂</span> 워치 파일(GPX/TCX) 열기
                  <input type="file" accept=".gpx,.tcx,.xml" onChange={handleGpsFileUpload} className="hidden" />
                </label>

                {!isLiveGpsTracking ? (
                  <button
                    type="button"
                    onClick={startLiveSmartphoneGps}
                    className="bg-slate-900 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 font-bold text-xs py-3 px-3 rounded-xl flex items-center justify-center gap-1.5 transition"
                  >
                    <span>📡</span> 폰 실시간 GPS 측정
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopLiveSmartphoneGps}
                    className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 font-black text-xs py-3 px-3 rounded-xl flex items-center justify-center gap-1.5 animate-pulse transition"
                  >
                    <span>⏹</span> 측정 종료 및 분석
                  </button>
                )}
              </div>

              {/* 실시간 스마트폰 GPS 측정 중 상태창 */}
              {isLiveGpsTracking && (
                <div className="bg-slate-900 border border-red-500/40 rounded-xl p-3 space-y-2 animate-in fade-in">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-red-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                      실시간 GPS 경로 수집 중... (화면을 켜두세요)
                    </span>
                    <span className="text-[11px] text-slate-400 font-bold">{liveGpsStats.pointCount} pt</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div className="bg-slate-800/80 rounded-lg p-2">
                      <div className="text-[10px] text-slate-400">경과 시간</div>
                      <div className="text-sm font-black text-white">{formatDurationKo(liveGpsStats.elapsedSec)}</div>
                    </div>
                    <div className="bg-slate-800/80 rounded-lg p-2">
                      <div className="text-[10px] text-slate-400">이동 거리</div>
                      <div className="text-sm font-black text-emerald-400">{liveGpsStats.distanceKm} km</div>
                    </div>
                    <div className="bg-slate-800/80 rounded-lg p-2">
                      <div className="text-[10px] text-slate-400">현재/최고 속도</div>
                      <div className="text-sm font-black text-amber-400">{liveGpsStats.currentSpeedKmh} <span className="text-[10px] text-slate-400">/ {liveGpsStats.maxSpeedKmh}</span></div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-0.5 px-0.5">
                <span className="text-[11px] text-slate-400">워치 파일이 없어도 기능을 바로 테스트해볼 수 있어요!</span>
                <button
                  type="button"
                  onClick={loadSampleGpsSession}
                  className="text-[11px] font-bold text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-lg transition shrink-0"
                >
                  🧪 샘플 기록 체험
                </button>
              </div>
            </div>

            {/* 현재 분석된 GPS 세션 결과 카드 */}
            {gpsSession ? (
              <div className="space-y-3 animate-in fade-in">
                {/* 선수/쿼터 지정 및 저장/공유 컨트롤 바 */}
                <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <select
                      value={gpsSelectedPlayerId}
                      onChange={(e) => setGpsSelectedPlayerId(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none"
                    >
                      <option value="">선수 선택 (내 이름 지정)</option>
                      {currentTeamPlayers.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.birthYear})</option>
                      ))}
                    </select>
                    <select
                      value={gpsQuarterLabel}
                      onChange={(e) => setGpsQuarterLabel(e.target.value)}
                      className="w-24 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-bold text-emerald-400 outline-none"
                    >
                      <option value="1Q">1쿼터</option>
                      <option value="2Q">2쿼터</option>
                      <option value="3Q">3쿼터</option>
                      <option value="4Q">4쿼터</option>
                      <option value="전체">경기 전체</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={saveGpsSessionToTeam}
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow"
                    >
                      💾 팀 기록에 저장
                    </button>
                    <button
                      type="button"
                      onClick={triggerGpsShare}
                      className="flex-1 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
                    >
                      <Share2 size={14}/> 히트맵 카드 공유
                    </button>
                  </div>
                </div>

                {/* 캡처 및 공유 대상 영역 */}
                <div ref={gpsCardCaptureRef} className="bg-slate-900 border border-slate-700/90 rounded-3xl p-4 space-y-4 shadow-xl">
                  {/* 리포트 헤더 */}
                  <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {gpsQuarterLabel}
                        </span>
                        <span className="text-base font-black text-white">
                          {currentTeamPlayers.find(p => p.id === gpsSelectedPlayerId)?.name || gpsSession.playerName || 'GPS 활동 리포트'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {gpsSession.date} · {gpsSession.title}
                      </div>
                    </div>
                    <div className="text-right bg-slate-800/90 px-3 py-1.5 rounded-2xl border border-slate-700">
                      <div className="text-[10px] text-slate-400 font-bold">활동 평점</div>
                      <div className="text-lg font-black text-yellow-400 leading-tight">{gpsSession.activityScore}<span className="text-xs text-slate-400 font-normal">점</span></div>
                    </div>
                  </div>

                  {/* 피치 뷰 모드 전환 & 방향 보정 컨트롤 */}
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700 flex-1 gap-1">
                      <button
                        type="button"
                        onClick={() => { setGpsViewMode('heatmap'); setGpsReplayPlaying(false); }}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition ${gpsViewMode === 'heatmap' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                      >
                        🔥 히트맵
                      </button>
                      <button
                        type="button"
                        onClick={() => { setGpsViewMode('sprint'); setGpsReplayPlaying(false); }}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition ${gpsViewMode === 'sprint' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'}`}
                      >
                        ⚡ 스프린트
                      </button>
                      <button
                        type="button"
                        onClick={() => { setGpsViewMode('replay'); if (gpsReplayProgress >= 100) setGpsReplayProgress(0); setGpsReplayPlaying(true); }}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition ${gpsViewMode === 'replay' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                      >
                        ▶️ 2D 리플레이
                      </button>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setGpsFlipVertical(v => !v)}
                        className="h-8 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-[11px] font-bold transition"
                        title="공격 방향 상하 반전"
                      >
                        🔄 반전
                      </button>
                      <button
                        type="button"
                        onClick={() => setGpsRotate90(v => !v)}
                        className="h-8 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-[11px] font-bold transition"
                        title="경기장 축 90도 회전"
                      >
                        📐 축회전
                      </button>
                    </div>
                  </div>

                  {/* 2D 축구장 히트맵 캔버스 */}
                  <div className="relative flex flex-col items-center">
                    <canvas
                      ref={gpsCanvasRef}
                      width={340}
                      height={490}
                      className="w-full max-w-[320px] rounded-2xl border-2 border-emerald-500/40 shadow-inner"
                    />
                    {/* 범례 */}
                    <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-slate-400 font-bold">
                      {gpsViewMode === 'sprint' ? (
                        <>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-1 bg-sky-400 inline-block rounded"></span> 고속 러닝 (14~20km/h)</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-1 bg-yellow-400 inline-block rounded"></span> 스프린트 (20km/h+)</span>
                        </>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span>낮음</span>
                          <div className="w-28 h-2 rounded-full bg-gradient-to-r from-blue-500 via-green-400 via-yellow-400 to-red-500"></div>
                          <span>높음 (활동 밀집도)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 리플레이 컨트롤 바 (리플레이 모드일 때만 표시) */}
                  {gpsViewMode === 'replay' && (
                    <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-3 flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (gpsReplayProgress >= 100) setGpsReplayProgress(0);
                          setGpsReplayPlaying(p => !p);
                        }}
                        className="px-3 py-1.5 bg-blue-500 hover:bg-blue-400 text-white rounded-lg text-xs font-black shrink-0"
                      >
                        {gpsReplayPlaying ? '⏸ 일시정지' : '▶ 재생'}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={Math.round(gpsReplayProgress)}
                        onChange={(e) => { setGpsReplayPlaying(false); setGpsReplayProgress(Number(e.target.value)); }}
                        className="flex-1 accent-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setGpsReplaySpeed(s => (s === 1 ? 2 : s === 2 ? 4 : 1))}
                        className="px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-[11px] font-black text-blue-400 shrink-0"
                      >
                        {gpsReplaySpeed}x 배속
                      </button>
                    </div>
                  )}

                  {/* 핵심 스탯 6종 그리드 */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-2.5">
                      <div className="text-[10px] font-bold text-slate-400">총 이동거리</div>
                      <div className="text-base font-black text-emerald-400 mt-0.5">{gpsSession.totalDistanceKm} <span className="text-[11px] font-bold">km</span></div>
                    </div>
                    <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-2.5">
                      <div className="text-[10px] font-bold text-slate-400">최고 속도</div>
                      <div className="text-base font-black text-amber-400 mt-0.5">{gpsSession.maxSpeedKmh} <span className="text-[11px] font-bold">km/h</span></div>
                    </div>
                    <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-2.5">
                      <div className="text-[10px] font-bold text-slate-400">스프린트</div>
                      <div className="text-base font-black text-yellow-300 mt-0.5">{gpsSession.sprintCount} <span className="text-[11px] font-bold">회 ({gpsSession.sprintDistanceM}m)</span></div>
                    </div>
                    <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-2.5">
                      <div className="text-[10px] font-bold text-slate-400">활동 시간</div>
                      <div className="text-sm font-black text-white mt-0.5">{formatDurationKo(gpsSession.durationSec)}</div>
                    </div>
                    <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-2.5">
                      <div className="text-[10px] font-bold text-slate-400">평균 속도</div>
                      <div className="text-sm font-black text-blue-400 mt-0.5">{gpsSession.avgSpeedKmh} <span className="text-[10px]">km/h</span></div>
                    </div>
                    <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-2.5">
                      <div className="text-[10px] font-bold text-slate-400">{gpsSession.avgHr ? '평균/최고 심박' : '소모 칼로리'}</div>
                      <div className="text-sm font-black text-rose-400 mt-0.5">
                        {gpsSession.avgHr ? `${gpsSession.avgHr}/${gpsSession.maxHr} bpm` : `${gpsSession.calories} kcal`}
                      </div>
                    </div>
                  </div>

                  {/* 속도 구간별 비중 바 (Speed Zones) */}
                  <div className="bg-slate-800/70 border border-slate-700/70 rounded-2xl p-3 space-y-2">
                    <div className="flex justify-between items-center text-[11px] font-bold text-slate-300">
                      <span>속도 구간별 활동 비율</span>
                      <span className="text-[10px] text-slate-400">소모 칼로리 약 {gpsSession.calories} kcal</span>
                    </div>
                    <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-900">
                      <div style={{ width: `${gpsSession.zones?.walk || 0}%` }} className="bg-slate-500 h-full" title="걷기" />
                      <div style={{ width: `${gpsSession.zones?.jog || 0}%` }} className="bg-emerald-500 h-full" title="조깅" />
                      <div style={{ width: `${gpsSession.zones?.run || 0}%` }} className="bg-sky-400 h-full" title="러닝" />
                      <div style={{ width: `${gpsSession.zones?.sprint || 0}%` }} className="bg-amber-400 h-full" title="스프린트" />
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-[10px] text-center font-bold pt-0.5">
                      <div className="text-slate-400">걷기 {gpsSession.zones?.walk || 0}%</div>
                      <div className="text-emerald-400">조깅 {gpsSession.zones?.jog || 0}%</div>
                      <div className="text-sky-400">러닝 {gpsSession.zones?.run || 0}%</div>
                      <div className="text-amber-400">질주 {gpsSession.zones?.sprint || 0}%</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-800/50 border border-slate-700/70 rounded-2xl p-6 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-2xl">
                  ⌚
                </div>
                <div className="text-white font-bold text-base">스마트워치 GPS 기록을 불러와보세요!</div>
                <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                  애플워치·갤럭시워치로 측정한 운동 파일(<strong className="text-slate-200">GPX/TCX</strong>)을 열면 2D 축구장 <strong className="text-emerald-400">네온 히트맵, 최고 속도, 스프린트 횟수, 동선 리플레이</strong>가 즉시 생성됩니다.
                </p>
                <div className="flex justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={loadSampleGpsSession}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition shadow"
                  >
                    🧪 샘플 데이터로 미리보기
                  </button>
                  <button
                    type="button"
                    onClick={() => setGpsGuideModal(true)}
                    className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs rounded-xl transition"
                  >
                    ⌚ 워치 파일 추출법
                  </button>
                </div>
              </div>
            )}

            {/* 팀원 저장된 GPS 기록 리스트 */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-black text-slate-300 flex items-center gap-1.5">
                  🏆 우리 팀 저장된 GPS 기록 ({savedGpsRecords.length})
                </h3>
                <span className="text-[10px] text-slate-500">터치하여 히트맵 보기</span>
              </div>
              {savedGpsRecords.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500 bg-slate-900/50 rounded-xl border border-slate-800">
                  아직 저장된 팀원 GPS 기록이 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {savedGpsRecords.map(rec => (
                    <div
                      key={rec.id}
                      onClick={() => {
                        setGpsSession(rec);
                        setGpsSelectedPlayerId(rec.playerId || '');
                        setGpsQuarterLabel(rec.quarterLabel || '1Q');
                        setGpsViewMode('heatmap');
                        setGpsReplayPlaying(false);
                      }}
                      className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 ${gpsSession?.id === rec.id ? 'bg-slate-900 border-emerald-500/50' : 'bg-slate-900/70 border-slate-700/80 hover:border-slate-600'}`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            {rec.quarterLabel || '기록'}
                          </span>
                          <span className="text-sm font-black text-white truncate">{rec.playerName || '선수'}</span>
                          <span className="text-[10px] text-slate-500">{rec.date}</span>
                        </div>
                        <div className="flex items-center gap-2.5 mt-1 text-[11px] text-slate-300 font-bold">
                          <span>🏃 <strong className="text-emerald-400">{rec.totalDistanceKm}km</strong></span>
                          <span>⚡ 최고 <strong className="text-amber-400">{rec.maxSpeedKmh}km/h</strong></span>
                          <span>🔥 질주 <strong className="text-yellow-300">{rec.sprintCount}회</strong></span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-black text-yellow-400 bg-slate-800 px-2 py-1 rounded-lg border border-slate-700">
                          {rec.activityScore}점
                        </span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); requestDeleteGpsRecord(rec.id); }}
                          className="p-1.5 text-slate-500 hover:text-red-400 transition"
                          title="기록 삭제"
                        >
                          <Trash2 size={14}/>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
            
            {calculatedPlayersList.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-16 text-center animate-in fade-in zoom-in-95">
                 <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-4 border border-slate-700"><Users size={32} className="text-slate-500" /></div>
                 <h3 className="text-white font-bold text-lg mb-2">팀 명단이 비어있습니다.</h3>
                 <p className="text-slate-400 text-sm mb-6 max-w-[250px]">팀을 함께할 선수들을 등록해주세요.<br/>명단이 있어야 경기 기록이 가능합니다.</p>
                 {isAdmin ? (
                    <button onClick={() => setRosterModal({isOpen: true, player: null})} className="bg-blue-500 hover:bg-blue-400 text-white font-bold px-6 py-3 rounded-xl transition shadow-lg flex items-center gap-2 animate-pulse"><Plus size={18}/> 첫 선수 등록하기</button>
                 ) : (
                    <p className="text-xs text-slate-500 bg-slate-800 px-4 py-2 rounded-lg border border-slate-700">팀 관리자만 선수를 등록할 수 있습니다.</p>
                 )}
               </div>
            ) : (
              <div className="space-y-2">
                {calculatedPlayersList.map(p => (
                  <div key={p.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center group shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-600 flex items-center justify-center font-black text-slate-400 shrink-0">{p.birthYear}</div>
                      <div>
                        <div className="font-bold text-white text-lg">{p.name}</div>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span className="text-[11px] bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-slate-400">누적 참석 <strong className="text-blue-400">{p.trueCaps || 0}</strong></span>
                          <span className="text-[11px] bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-slate-400">⚽ <strong className="text-white">{p.trueGoals || 0}</strong></span>
                          <span className="text-[11px] bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-slate-400">👟 <strong className="text-white">{p.trueAssists || 0}</strong></span>
                          {(p.trueGkQuarters || 0) > 0 && (
                            <span className="text-[11px] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-300">
                              🧤 <strong>{p.trueGkQuarters}Q</strong> / <strong>{p.trueGoalsConceded || 0}실점</strong> ({((p.trueGoalsConceded || 0) / p.trueGkQuarters).toFixed(2)})
                            </span>
                          )}
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
            )}
          </div>
        )}
      </main>

      {}
      <nav className="fixed bottom-0 w-full max-w-md bg-slate-900 border-t border-slate-800 flex justify-around p-2 pb-6 z-[60]" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <button onClick={() => setActiveTab('matches')} className={`flex flex-col items-center p-2 flex-1 ${activeTab === 'matches' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}><List size={20} className="mb-1" /><span className="text-[10px] font-bold">경기</span></button>
        <button onClick={() => setActiveTab('schedule')} className={`flex flex-col items-center p-2 flex-1 ${activeTab === 'schedule' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}><Calendar size={20} className="mb-1" /><span className="text-[10px] font-bold">일정</span></button>
        <button onClick={() => setActiveTab('stats')} className={`flex flex-col items-center p-2 flex-1 ${activeTab === 'stats' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}><BarChart2 size={20} className="mb-1" /><span className="text-[10px] font-bold">통계</span></button>
        <button onClick={() => setActiveTab('tactics')} className={`flex flex-col items-center p-2 flex-1 ${activeTab === 'tactics' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}><Target size={20} className="mb-1" /><span className="text-[10px] font-bold">전술</span></button>
        <button onClick={() => setActiveTab('gps')} className={`flex flex-col items-center p-2 flex-1 ${activeTab === 'gps' ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}><Activity size={20} className="mb-1" /><span className="text-[10px] font-bold">GPS</span></button>
        <button onClick={() => setActiveTab('roster')} className={`flex flex-col items-center p-2 flex-1 ${activeTab === 'roster' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}><Users size={20} className="mb-1" /><span className="text-[10px] font-bold">명단</span></button>
      </nav>

      {tacticsTutorialModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[200] p-4 animate-in fade-in zoom-in-95">
           <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-xl relative">
              <button onClick={() => setTacticsTutorialModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20}/></button>
              <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2"><Target className="text-emerald-400"/> 전술판 사용 가이드</h2>
              <div className="space-y-6">
                 <div className="flex gap-4"><div className="w-8 h-8 rounded-full bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-black shrink-0 border border-emerald-500/30">1</div><div><div className="text-white font-bold mb-1">선수 배치 및 스케치</div><div className="text-sm text-slate-400 leading-snug">선수 토큰을 이동시키고, 화살표나 지역 표시 등 그리기 도구를 활용해 상황을 세팅하세요.</div></div></div>
                 <div className="flex gap-4"><div className="w-8 h-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center font-black shrink-0 border border-red-500/30">2</div><div><div className="text-white font-bold mb-1">[자동 녹화] 켜고 움직이기</div><div className="text-sm text-slate-400 leading-snug">상단의 <strong className="text-red-400">자동녹화</strong> 버튼을 켜면 화면 테두리가 빨간색으로 바뀝니다.<br/>이 상태에서 선수를 움직이거나 선을 그릴 때마다 컷(프레임)이 자동 저장됩니다!</div></div></div>
                 <div className="flex gap-4"><div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-black shrink-0 border border-blue-500/30">3</div><div><div className="text-white font-bold mb-1">애니메이션 확인 및 공유</div><div className="text-sm text-slate-400 leading-snug"><strong className="text-blue-400">재생</strong> 버튼을 눌러 부드러운 애니메이션을 확인하고, <strong className="text-yellow-400">영상공유</strong> 버튼으로 MP4 파일을 추출해 카톡으로 공유하세요!</div></div></div>
              </div>
              <button onClick={() => setTacticsTutorialModal(false)} className="w-full mt-8 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3.5 rounded-xl transition">닫기</button>
           </div>
        </div>
      )}

      {gpsGuideModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[200] p-4 animate-in fade-in zoom-in-95">
          <div className="bg-slate-800 p-5 sm:p-6 rounded-3xl w-full max-w-sm border border-slate-700 shadow-2xl max-h-[86vh] flex flex-col relative">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <span>⌚</span> 스마트워치 GPS 연동 가이드
              </h2>
              <button onClick={() => setGpsGuideModal(false)} className="text-slate-400 hover:text-white p-1"><X size={20}/></button>
            </div>

            <div className="grid grid-cols-2 bg-slate-900 p-1 rounded-xl border border-slate-700/80 gap-1 mb-4 shrink-0">
              <button
                type="button"
                onClick={() => setGpsGuideTab('android')}
                className={`py-2 rounded-lg text-xs font-bold transition ${gpsGuideTab === 'android' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                🤖 갤럭시워치 (삼성헬스)
              </button>
              <button
                type="button"
                onClick={() => setGpsGuideTab('ios')}
                className={`py-2 rounded-lg text-xs font-bold transition ${gpsGuideTab === 'ios' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                🍎 애플워치 (iOS)
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-0.5 hide-scrollbar text-xs leading-relaxed text-slate-300">
              {gpsGuideTab === 'android' ? (
                <>
                  <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-3.5 flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-black flex items-center justify-center shrink-0">1</div>
                    <div>
                      <div className="font-bold text-white mb-0.5">워치에서 운동 기록 시작</div>
                      갤럭시워치 <strong className="text-emerald-400">[삼성 헬스]</strong>에서 <strong className="text-white">[달리기]</strong>(또는 야외 GPS가 켜진 운동 종목)를 선택하고 경기를 진행하세요.
                      <div className="text-[11px] text-amber-300 mt-1">* 경로(GPS) 저장이 지원되는 '달리기/걷기/자전거' 모드로 측정해야 GPX 내보내기가 활성화됩니다.</div>
                    </div>
                  </div>
                  <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-3.5 flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-black flex items-center justify-center shrink-0">2</div>
                    <div>
                      <div className="font-bold text-white mb-0.5">스마트폰 삼성 헬스에서 GPX 내보내기</div>
                      경기 종료 후 스마트폰 <strong className="text-white">[삼성 헬스]</strong> 앱 → 방금 기록된 운동 선택 → 우측 상단 <strong className="text-amber-400">[⋮ (점 3개)]</strong> → <strong className="text-white">[GPX로 내보내기]</strong>를 눌러 저장하세요.
                    </div>
                  </div>
                  <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-3.5 flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-black flex items-center justify-center shrink-0">3</div>
                    <div>
                      <div className="font-bold text-white mb-0.5">MATCHBOARD에서 파일 열기</div>
                      현재 GPS 탭의 <strong className="text-blue-400">[📂 워치 파일(GPX/TCX) 열기]</strong> 버튼을 눌러 내보낸 파일을 선택하면 히트맵과 최고속도·스프린트가 자동 분석됩니다!
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-3.5 flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-black flex items-center justify-center shrink-0">1</div>
                    <div>
                      <div className="font-bold text-white mb-0.5">애플워치로 경기 측정</div>
                      애플워치 기본 <strong className="text-emerald-400">[운동]</strong> 앱에서 <strong className="text-white">[실외 달리기]</strong> 또는 <strong className="text-white">[축구]</strong>를 켜고 경기를 뛰세요.
                    </div>
                  </div>
                  <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-3.5 flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-black flex items-center justify-center shrink-0">2</div>
                    <div>
                      <div className="font-bold text-white mb-0.5">GPX 파일로 내보내기</div>
                      아이폰 무료 연동 앱(<strong className="text-white">HealthFit, WorkOutDoors, RunGap, Strava</strong> 등)에서 해당 운동 기록을 선택해 <strong className="text-amber-400">[GPX 파일 내보내기(공유) → 파일에 저장]</strong>을 선택하세요.
                    </div>
                  </div>
                  <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-3.5 flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-black flex items-center justify-center shrink-0">3</div>
                    <div>
                      <div className="font-bold text-white mb-0.5">MATCHBOARD에서 파일 열기</div>
                      현재 GPS 탭의 <strong className="text-blue-400">[📂 워치 파일(GPX/TCX) 열기]</strong> 버튼으로 저장된 `.gpx` 파일을 불러오면 히트맵과 스탯이 즉시 생성됩니다!
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setGpsGuideModal(false)}
              className="w-full mt-4 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl text-sm transition shrink-0"
            >
              확인했어요
            </button>
          </div>
        </div>
      )}

      {galleryModal.isOpen && (
        <div className="fixed inset-0 bg-black z-[250] flex flex-col animate-in fade-in">
          <div className="flex justify-between items-center p-4 absolute top-0 w-full z-10 bg-gradient-to-b from-black/80 to-transparent">
            <div className="text-white font-bold text-sm bg-black/50 px-3 py-1.5 rounded-full">{galleryModal.currentIndex + 1} / {(galleryModal.photos||[]).length}</div>
            <div className="flex gap-4">
              {isAdmin && ( <button onClick={() => requestDeletePhoto((galleryModal.photos||[])[galleryModal.currentIndex].id)} className="text-white/70 hover:text-red-400 bg-black/50 p-2 rounded-full transition"><Trash2 size={20}/></button> )}
              <button onClick={() => setGalleryModal({ isOpen: false, photos: [], currentIndex: 0, matchId: null })} className="text-white bg-black/50 p-2 rounded-full hover:bg-black/80 transition"><X size={20}/></button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center relative overflow-hidden" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
             <div className="hidden">
               {galleryModal.currentIndex > 0 && <img src={(galleryModal.photos||[])[galleryModal.currentIndex - 1]?.url} alt="preload-prev" />}
               {galleryModal.currentIndex < (galleryModal.photos||[]).length - 1 && <img src={(galleryModal.photos||[])[galleryModal.currentIndex + 1]?.url} alt="preload-next1" />}
               {galleryModal.currentIndex < (galleryModal.photos||[]).length - 2 && <img src={(galleryModal.photos||[])[galleryModal.currentIndex + 2]?.url} alt="preload-next2" />}
             </div>

             {galleryModal.currentIndex > 0 && ( <button onClick={() => setGalleryModal(p => ({...p, currentIndex: p.currentIndex - 1}))} className="absolute left-4 p-3 bg-black/50 text-white rounded-full z-10 hidden sm:block"><ChevronLeft size={24}/></button> )}
             <img key={(galleryModal.photos||[])[galleryModal.currentIndex]?.id} src={(galleryModal.photos||[])[galleryModal.currentIndex]?.url} alt="gallery" className="max-w-full max-h-full object-contain animate-in fade-in zoom-in-95 duration-200" />
             {galleryModal.currentIndex < (galleryModal.photos||[]).length - 1 && ( <button onClick={() => setGalleryModal(p => ({...p, currentIndex: p.currentIndex + 1}))} className="absolute right-4 p-3 bg-black/50 text-white rounded-full z-10 hidden sm:block"><ChevronRight size={24}/></button> )}
          </div>
        </div>
      )}

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
      {renderShareModal()}
      {renderDateMemoModal()}
      {renderGoalFlowModal()}
      {renderLogEditModal()}
      {renderQuarterEditModal()}
      {renderHiddenCaptureArea()}
      {renderSystemModals()}
    </div>
  );
}