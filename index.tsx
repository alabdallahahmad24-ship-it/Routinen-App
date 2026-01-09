
import React, { useState, DragEvent, FormEvent, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

// --- Interfaces ---
interface Routine {
  id: string;
  name: string;
  startTime: string; // "HH:MM:SS"
  durationSeconds: number;
  endTime: string;   // "HH:MM:SS"
}

interface RoutineList {
  id: string;
  title: string;
  routines: Routine[];
}

interface ActiveRoutineState {
  listId: string;
  routineId: string;
  currentRoutineIndex: number;
  timeLeftInSeconds: number;
  routineName: string; 
}

// --- Helper Functions ---
const generateId = (): string => `id-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

const parseTimeToDate = (timeStr: string): Date => { 
  const parts = timeStr.split(':').map(Number);
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  const seconds = parts[2] || 0;
  const date = new Date();
  date.setHours(hours, minutes, seconds, 0);
  return date;
};

const formatTimeFromDate = (date: Date): string => {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

const addSecondsToDate = (date: Date, seconds: number): Date => {
  return new Date(date.getTime() + seconds * 1000);
};

const parseDurationToSeconds = (input: string): number | null => {
  if (!input || input.trim() === '') return null;

  const numberInput = Number(input);
  if (!isNaN(numberInput) && String(numberInput) === input.trim()) {
    return Math.max(0, numberInput * 60);
  }

  const parts = input.split(':').map(Number);
  if (parts.some(isNaN)) return null;

  if (parts.length === 2) { // MM:SS
    return Math.max(0, parts[0] * 60 + parts[1]);
  } else if (parts.length === 3) { // HH:MM:SS
    return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }
  return null;
};

const formatDuration = (totalSeconds: number): string => {
  if (totalSeconds < 0) totalSeconds = 0;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  if (m > 0) {
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${s}s`;
};


const formatTimeLeft = (totalSeconds: number): string => {
  if (totalSeconds < 0) totalSeconds = 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// --- State for Drag & Drop ---
interface DraggedItemInfo {
  cardId: string;
  sourceListId: string;
  originalIndex: number;
}
let draggedItemInfo: DraggedItemInfo | null = null;

interface DraggedListInfo {
  id: string;
  originalIndex: number;
}

let germanVoices: SpeechSynthesisVoice[] = [];

const loadVoices = () => {
    const allVoices = window.speechSynthesis.getVoices();
    germanVoices = allVoices.filter(voice => voice.lang.startsWith('de'));
};

if (typeof window !== 'undefined' && window.speechSynthesis) {
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
}

const playBeepSound = (callback?: () => void, durationMs = 150, frequency = 440, volume = 0.03) => { // Shortened beep
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!audioContext) {
        if (callback) setTimeout(callback, durationMs); 
        return;
    }
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'sine'; 
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime); // A4 note
    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + durationMs / 1000);

    setTimeout(() => {
        try {
            oscillator.disconnect();
            gainNode.disconnect();
            audioContext.close().catch(e => console.warn("AudioContext close error:", e));
        } catch(e) {
            console.warn("Error during audio cleanup:", e);
        }
        if (callback) callback();
    }, durationMs + 50); 
};


const speakText = (text: string) => {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
      console.warn("Speech synthesis not available or text is empty. Attempting fallback sound.");
      playBeepSound(undefined, 300, 300, 0.03); 
      return;
    }
  
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    
    if (germanVoices.length > 0) {
      const femaleVoice = germanVoices.find(voice => voice.name.toLowerCase().includes('female') || voice.name.toLowerCase().includes('frau'));
      utterance.voice = femaleVoice || germanVoices[0];
    } 
  
    utterance.pitch = 1;
    utterance.rate = 1;
    window.speechSynthesis.cancel(); 
    window.speechSynthesis.speak(utterance);
  };


// --- Components ---
const RoutineCardComponent: React.FC<{
  routine: Routine;
  listId: string;
  cardIndex: number;
  isActive: boolean;
  timeLeft: number | null;
  onUpdateRoutineDuration: (listId: string, routineId: string, newDurationSeconds: number) => void;
  onDeleteRoutine: (listId: string, routineId: string) => void;
  isSomethingDragging: boolean;
}> = ({ routine, listId, cardIndex, isActive, timeLeft, onUpdateRoutineDuration, onDeleteRoutine, isSomethingDragging }) => {
  const [isEditingDuration, setIsEditingDuration] = useState(false);
  const [editDurationInput, setEditDurationInput] = useState(formatDuration(routine.durationSeconds));
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);
  const optionsButtonRef = useRef<HTMLButtonElement>(null);


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        optionsMenuRef.current &&
        !optionsMenuRef.current.contains(event.target as Node) &&
        optionsButtonRef.current &&
        !optionsButtonRef.current.contains(event.target as Node)
      ) {
        setShowOptionsMenu(false);
      }
    };

    if (showOptionsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showOptionsMenu]);


  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = 'move';
    draggedItemInfo = { cardId: routine.id, sourceListId: listId, originalIndex: cardIndex };
    e.dataTransfer.setData('text/plain', routine.id); 
    setTimeout(() => {
      if (cardRef.current) {
        cardRef.current.style.opacity = '0.5';
      }
    }, 0);
  };

  const handleDragEnd = (e: DragEvent<HTMLDivElement>) => {
    if (cardRef.current) {
      cardRef.current.style.opacity = '1';
    }
  };

  const handleSaveDuration = () => {
    const newDurationSec = parseDurationToSeconds(editDurationInput);
    if (newDurationSec !== null && newDurationSec >= 0) {
      onUpdateRoutineDuration(listId, routine.id, newDurationSec);
      setIsEditingDuration(false);
      setShowOptionsMenu(false);
    } else {
      alert("Ungültige Dauer. Bitte Zahl für Minuten (z.B. 45) oder im Format Std:Min:Sek (z.B. 0:25:00) eingeben.");
    }
  };
  
  const toggleOptionsMenu = () => {
    setShowOptionsMenu(!showOptionsMenu);
    if(isEditingDuration && showOptionsMenu) setIsEditingDuration(false); 
  };

  const handleEditDurationClick = () => {
    setEditDurationInput(formatDuration(routine.durationSeconds)); 
    setIsEditingDuration(true);
    setShowOptionsMenu(false); 
  };

  return (
    <div
      ref={cardRef}
      id={routine.id}
      className={`routine-card ${isActive ? 'routine-card--active' : ''} ${isSomethingDragging && draggedItemInfo?.cardId === routine.id ? 'dragging' : ''}`}
      draggable="true"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      data-card-id={routine.id} 
    >
      <div className="card-header">
        <p><strong>{routine.name}</strong></p>
        <button 
          ref={optionsButtonRef}
          onClick={toggleOptionsMenu}
          className="options-button" 
          aria-label={`Optionen für Routine ${routine.name}`}
          aria-expanded={showOptionsMenu}
          aria-controls={`options-menu-${routine.id}`}
        >
          ...
        </button>
        {showOptionsMenu && (
          <div ref={optionsMenuRef} id={`options-menu-${routine.id}`} className="options-menu card-options-menu" role="menu">
            <button role="menuitem" onClick={handleEditDurationClick}>Dauer bearbeiten</button>
            <button role="menuitem" onClick={() => { onDeleteRoutine(listId, routine.id); setShowOptionsMenu(false); }}>Löschen</button>
          </div>
        )}
      </div>
      {isEditingDuration && (
        <div className="edit-form card-edit-form">
          <label htmlFor={`editDuration-${routine.id}`}>Dauer ändern:</label>
          <input 
            type="text" 
            id={`editDuration-${routine.id}`} 
            value={editDurationInput} 
            onChange={e => setEditDurationInput(e.target.value)} 
            placeholder="z.B. 45 (für Min.) oder 0:25:00 (Std:Min:Sek)"
          />
          <button onClick={handleSaveDuration}>Speichern</button>
          <button onClick={() => { setIsEditingDuration(false); setEditDurationInput(formatDuration(routine.durationSeconds));}} style={{backgroundColor: '#aaa'}}>Abbrechen</button>
        </div>
      )}
      <div className="card-footer">
        <span className="card-time-info">{routine.startTime} - {routine.endTime}</span>
        <span className="card-duration-info">Dauer: {formatDuration(routine.durationSeconds)}</span>
      </div>
      {isActive && timeLeft !== null && (
        <p className="timer-display" aria-live="polite">Verbleibend: {formatTimeLeft(timeLeft)}</p>
      )}
    </div>
  );
};

const RoutineListComponent: React.FC<{
  list: RoutineList;
  listIndex: number;
  isBeingDragged: boolean;
  onAddRoutine: (listId: string, name: string, durationSeconds: number, startTime?: string) => void;
  onMoveRoutine: (cardId: string, sourceListId: string, targetListId: string, targetIndex: number) => void;
  activeRoutineState: ActiveRoutineState | null;
  onToggleStartStopList: (listId: string) => void;
  onUpdateListStartTime: (listId: string, newStartTime: string) => void;
  onUpdateRoutineDurationInList: (listId: string, routineId: string, newDurationSeconds: number) => void;
  onDeleteRoutineInList: (listId: string, routineId: string) => void;
  onDeleteAllRoutinesInList: (listId: string) => void;
  onDragStartList: (listId: string, index: number) => void;
  onDragEndList: () => void;
  isSomethingDragging: boolean;
}> = ({ 
  list, listIndex, isBeingDragged, onAddRoutine, onMoveRoutine, activeRoutineState, 
  onToggleStartStopList, onUpdateListStartTime, onUpdateRoutineDurationInList, 
  onDeleteRoutineInList, onDeleteAllRoutinesInList, onDragStartList, onDragEndList,
  isSomethingDragging
}) => {
  const [newRoutineName, setNewRoutineName] = useState('');
  const [newRoutineDurationInput, setNewRoutineDurationInput] = useState('30'); 
  const [newRoutineStartTime, setNewRoutineStartTime] = useState('08:00');
  const [showAddForm, setShowAddForm] = useState(false);

  const [isEditingListStartTime, setIsEditingListStartTime] = useState(false);
  const initialStartTimeForEdit = list.routines.length > 0 ? list.routines[0].startTime.substring(0,5) : '08:00';
  const [editListStartTime, setEditListStartTime] = useState(initialStartTimeForEdit);
  
  const [showListOptionsMenu, setShowListOptionsMenu] = useState(false);
  const cardsContainerRef = useRef<HTMLDivElement>(null);
  const listOptionsMenuRef = useRef<HTMLDivElement>(null);
  const listOptionsButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const newInitialStartTime = list.routines.length > 0 ? list.routines[0].startTime.substring(0,5) : '08:00';
    setEditListStartTime(newInitialStartTime);
  }, [list.routines]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        listOptionsMenuRef.current &&
        !listOptionsMenuRef.current.contains(event.target as Node) &&
        listOptionsButtonRef.current &&
        !listOptionsButtonRef.current.contains(event.target as Node)
      ) {
        setShowListOptionsMenu(false);
      }
    };

    if (showListOptionsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showListOptionsMenu]);


  const handleSubmitNewRoutine = (e: FormEvent) => {
    e.preventDefault();
    const durationSec = parseDurationToSeconds(newRoutineDurationInput);
    if (!newRoutineName.trim() || durationSec === null || durationSec <= 0) {
      alert('Bitte Namen und gültige Dauer angeben. Für Dauer: Zahl für Minuten (z.B. 45) oder Std:Min:Sek (z.B. 0:25:00).');
      return;
    }
    const isFirstRoutine = list.routines.length === 0;
    onAddRoutine(list.id, newRoutineName, durationSec, isFirstRoutine ? newRoutineStartTime : undefined);
    setNewRoutineName('');
    setNewRoutineDurationInput('30');
    setShowAddForm(false);
  };

  const handleDragOverCardContainer = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!draggedItemInfo || (draggedItemInfo.sourceListId === list.id && list.routines.length <=1 && list.routines[0]?.id === draggedItemInfo.cardId)) {
        const existingPlaceholder = cardsContainerRef.current?.querySelector('.dragging-placeholder');
        if (existingPlaceholder) existingPlaceholder.remove();
        return;
    }

    const cardsContainer = cardsContainerRef.current;
    if (!cardsContainer) return;

    let placeholder = cardsContainer.querySelector('.dragging-placeholder') as HTMLElement | null;
    if (!placeholder) {
        placeholder = document.createElement('div');
        placeholder.className = 'dragging-placeholder';
    }
    
    const mouseY = e.clientY;
    const cards = Array.from(cardsContainer.children).filter(child => child.classList.contains('routine-card') && child.id !== draggedItemInfo?.cardId);
    
    let insertBeforeElement: Element | null = null;
    for (const card of cards) {
        const rect = card.getBoundingClientRect();
        if (mouseY < rect.top + rect.height / 2) {
            insertBeforeElement = card;
            break;
        }
    }

    if (insertBeforeElement) {
        cardsContainer.insertBefore(placeholder, insertBeforeElement);
    } else {
        cardsContainer.appendChild(placeholder);
    }
  };

  const handleDragLeaveCardContainer = (e: DragEvent<HTMLDivElement>) => {
    if (cardsContainerRef.current && !cardsContainerRef.current.contains(e.relatedTarget as Node)) {
      const placeholder = cardsContainerRef.current.querySelector('.dragging-placeholder');
      if (placeholder) placeholder.remove();
    }
  };

  const handleDropOnCardContainer = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const cardsContainer = cardsContainerRef.current;
    const placeholder = cardsContainer?.querySelector('.dragging-placeholder');
    
    let targetIndex = list.routines.length;

    if (placeholder && cardsContainer) {
        const childrenAndPlaceholder = Array.from(cardsContainer.children)
            .filter(child => child.classList.contains('routine-card') || child === placeholder);
        const pIndex = childrenAndPlaceholder.indexOf(placeholder);
        if (pIndex !== -1) {
            targetIndex = pIndex;
        }
    }
     if (placeholder) placeholder.remove();


    if (draggedItemInfo) {
      onMoveRoutine(draggedItemInfo.cardId, draggedItemInfo.sourceListId, list.id, targetIndex);
    }
  };

  const handleSaveListStartTime = () => {
    if (list.routines.length === 0) {
        alert("Die Liste enthält keine Routinen. Fügen Sie zuerst eine Routine hinzu, um die Startzeit zu ändern.");
        setIsEditingListStartTime(false);
        return;
    }
    if (!/^\d{2}:\d{2}$/.test(editListStartTime)) { 
        alert("Ungültiges Zeitformat. Bitte HH:MM verwenden.");
        return;
    }
    onUpdateListStartTime(list.id, editListStartTime + ":00"); 
    setIsEditingListStartTime(false);
  };
  
  const firstRoutineStartTimeDisplay = list.routines.length > 0 ? list.routines[0].startTime : "--:--:--";
  const isCurrentListActive = activeRoutineState?.listId === list.id;

  return (
    <div 
      className={`routine-list ${isBeingDragged ? 'dragging-list-visual' : ''}`}
      draggable="true"
      onDragStart={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.routine-card') || 
            target.closest('button') ||
            target.closest('input') ||
            target.closest('.options-menu') ||
            target.classList.contains('cards-container')) { // Prevent list drag if starting on card container itself
          // e.stopPropagation(); // Not needed if this is the intended draggable target.
          return; // Let card drag or other interactions happen.
        }
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/x-list-id', list.id); 
        onDragStartList(list.id, listIndex);
      }}
      onDragEnd={(e) => {
         const target = e.target as HTMLElement;
         if (target.closest('.routine-card') ||
             target.closest('button') ||
             target.closest('input') ||
             target.closest('.options-menu') ||
             target.classList.contains('cards-container')) {
          // e.stopPropagation();
          return;
        }
        onDragEndList();
      }}
      data-list-id={list.id} 
    >
      <div className="list-header">
        <h2>{list.title}</h2>
        <span className="list-start-time-display" aria-label="Startzeit der ersten Routine">{firstRoutineStartTimeDisplay}</span>
        <button 
          onClick={() => {
            setIsEditingListStartTime(!isEditingListStartTime);
            setEditListStartTime(list.routines.length > 0 ? list.routines[0].startTime.substring(0,5) : '08:00');
          }}
          className="edit-list-time-button"
          aria-label="Startzeit der Liste bearbeiten"
        >
          ✏️
        </button>
        <button 
          ref={listOptionsButtonRef}
          onClick={() => setShowListOptionsMenu(!showListOptionsMenu)} 
          className="options-button" 
          aria-label={`Optionen für Liste ${list.title}`}
          aria-expanded={showListOptionsMenu}
          aria-controls={`list-options-menu-${list.id}`}
        >
          ...
        </button>
        {showListOptionsMenu && (
          <div ref={listOptionsMenuRef} id={`list-options-menu-${list.id}`} className="options-menu list-options-menu" role="menu">
            <button role="menuitem" onClick={() => { 
              if (confirm(`Möchten Sie wirklich alle Karten in der Liste "${list.title}" löschen?`)) {
                onDeleteAllRoutinesInList(list.id);
              }
              setShowListOptionsMenu(false); 
            }}>
              Alle Karten löschen
            </button>
          </div>
        )}
      </div>
      {isEditingListStartTime && (
        <div className="edit-form list-edit-form">
          <label htmlFor={`editStartTime-${list.id}`}>Neue Startzeit (erste Routine HH:MM):</label>
          <input 
            type="time" 
            id={`editStartTime-${list.id}`} 
            value={editListStartTime} 
            onChange={e => setEditListStartTime(e.target.value)} 
            />
          <button onClick={handleSaveListStartTime}>Speichern</button>
          <button onClick={() => setIsEditingListStartTime(false)} style={{backgroundColor: '#aaa'}}>Abbrechen</button>
        </div>
      )}
      <button 
        className="list-start-button" 
        onClick={() => onToggleStartStopList(list.id)}
        aria-label={isCurrentListActive ? `Routinen stoppen für ${list.title}` : `Routinen starten für ${list.title}`}
      >
        {isCurrentListActive ? 'Routinen stoppen' : 'Routinen starten'}
      </button>
      <div 
        className="cards-container" 
        ref={cardsContainerRef}
        onDragOver={handleDragOverCardContainer} 
        onDrop={handleDropOnCardContainer} 
        onDragLeave={handleDragLeaveCardContainer}
      >
        {list.routines.map((routine, index) => (
          <RoutineCardComponent
            key={routine.id}
            routine={routine}
            listId={list.id}
            cardIndex={index}
            isActive={isCurrentListActive && activeRoutineState?.currentRoutineIndex === index}
            timeLeft={isCurrentListActive && activeRoutineState?.currentRoutineIndex === index ? activeRoutineState.timeLeftInSeconds : null}
            onUpdateRoutineDuration={onUpdateRoutineDurationInList}
            onDeleteRoutine={onDeleteRoutineInList}
            isSomethingDragging={isSomethingDragging}
          />
        ))}
      </div>
      {showAddForm ? (
        <form onSubmit={handleSubmitNewRoutine} className="add-routine-form">
          <div>
            <label htmlFor={`routineName-${list.id}`}>Name der Routine:</label>
            <input type="text" id={`routineName-${list.id}`} value={newRoutineName} onChange={(e) => setNewRoutineName(e.target.value)} required />
          </div>
          {list.routines.length === 0 && (
            <div>
              <label htmlFor={`routineStartTime-${list.id}`}>Startzeit (HH:MM):</label>
              <input type="time" id={`routineStartTime-${list.id}`} value={newRoutineStartTime} onChange={(e) => setNewRoutineStartTime(e.target.value)} required />
            </div>
          )}
          <div>
            <label htmlFor={`routineDuration-${list.id}`}>Dauer:</label>
            <input 
              type="text" 
              id={`routineDuration-${list.id}`} 
              value={newRoutineDurationInput} 
              onChange={(e) => setNewRoutineDurationInput(e.target.value)} 
              placeholder="z.B. 45 (für Min.) oder 0:25:00 (Std:Min:Sek)" 
              required 
            />
          </div>
          <button type="submit">Routine hinzufügen</button>
          <button type="button" onClick={() => setShowAddForm(false)} style={{marginLeft: '10px', backgroundColor: '#aaa'}}>Abbrechen</button>
        </form>
      ) : (
        <button onClick={() => setShowAddForm(true)} className="add-routine-form-button" style={{marginTop: 'auto', alignSelf: 'flex-start', padding: '8px 10px', background: 'transparent', border: 'none', color: '#5e6c84', cursor: 'pointer', textAlign: 'left', width: '100%'}}>
          + Routine hinzufügen...
        </button>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [lists, setLists] = useState<RoutineList[]>([]);
  const [newListName, setNewListName] = useState('');
  const [activeRoutineState, setActiveRoutineState] = useState<ActiveRoutineState | null>(null);
  const timerIdRef = useRef<NodeJS.Timeout | null>(null);
  const [draggedListInfo, setDraggedListInfo] = useState<DraggedListInfo | null>(null);
  
  const listsContainerRef = useRef<HTMLDivElement>(null); // Inner scrollable container
  const listsOuterContainerRef = useRef<HTMLDivElement>(null); // Outer container for mousedown
  
  const [zoomLevel, setZoomLevel] = useState(1.0);

  // Refs for drag-to-scroll background
  const isBackgroundDraggingRef = useRef(false);
  const backgroundDragStartXRef = useRef(0);
  const backgroundScrollLeftStartRef = useRef(0);


  useEffect(() => {
    if (activeRoutineState) {
      timerIdRef.current = setInterval(() => {
        setActiveRoutineState(prev => {
          if (!prev) { 
            if (timerIdRef.current) clearInterval(timerIdRef.current);
            return null;
          }
          if (prev.timeLeftInSeconds <= 1) { 
            if (timerIdRef.current) clearInterval(timerIdRef.current); 
            
            playBeepSound(() => { // Play beep first, then speak
                speakText(`${prev.routineName} ist fertig.`);
            });

            const currentList = lists.find(l => l.id === prev.listId);
            if (!currentList) return null; 

            const nextRoutineIndex = prev.currentRoutineIndex + 1;
            if (nextRoutineIndex < currentList.routines.length) {
              const nextRoutine = currentList.routines[nextRoutineIndex];
              return {
                listId: prev.listId,
                routineId: nextRoutine.id,
                currentRoutineIndex: nextRoutineIndex,
                timeLeftInSeconds: nextRoutine.durationSeconds,
                routineName: nextRoutine.name,
              };
            } else {
              speakText(`Alle Routinen in "${currentList.title}" abgeschlossen!`);
              return null; 
            }
          }
          return { ...prev, timeLeftInSeconds: prev.timeLeftInSeconds - 1 };
        });
      }, 1000);
    } else {
      if (timerIdRef.current) {
        clearInterval(timerIdRef.current);
        timerIdRef.current = null;
      }
    }
    return () => { 
      if (timerIdRef.current) {
        clearInterval(timerIdRef.current);
      }
    };
  }, [activeRoutineState, lists]);

  const handleAddList = (e: FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    setLists([...lists, { id: generateId(), title: newListName, routines: [] }]);
    setNewListName('');
  };

  const recalculateTimesInList = (list: RoutineList, startIndex: number = 0): RoutineList => {
    const updatedRoutines = [...list.routines];
    if (updatedRoutines.length === 0) return { ...list, routines: [] }; 

    for (let i = startIndex; i < updatedRoutines.length; i++) {
        let currentStartTimeDate: Date;
        if (i === 0) {
            currentStartTimeDate = parseTimeToDate(updatedRoutines[i].startTime);
        } else {
            if (!updatedRoutines[i-1] || !updatedRoutines[i-1].endTime) { 
                console.error("Error recalculating times: previous routine's end time missing.", updatedRoutines[i-1]);
                currentStartTimeDate = new Date(); 
            } else {
                currentStartTimeDate = parseTimeToDate(updatedRoutines[i-1].endTime);
            }
        }
        updatedRoutines[i].startTime = formatTimeFromDate(currentStartTimeDate);
        const endTimeDate = addSecondsToDate(currentStartTimeDate, updatedRoutines[i].durationSeconds);
        updatedRoutines[i].endTime = formatTimeFromDate(endTimeDate);
    }
    return { ...list, routines: updatedRoutines };
  };
  
  const handleAddRoutineToList = (listId: string, name: string, durationSeconds: number, startTimeStr?: string) => { 
    setLists(prevLists =>
      prevLists.map(list => {
        if (list.id === listId) {
          let newRoutineStartTimeStr: string; 
          if (startTimeStr) { 
            newRoutineStartTimeStr = startTimeStr + ":00";
          } else if (list.routines.length > 0) {
            newRoutineStartTimeStr = list.routines[list.routines.length - 1].endTime;
          } else {
            newRoutineStartTimeStr = '08:00:00'; 
          }
  
          const newRoutine: Routine = {
            id: generateId(),
            name,
            startTime: newRoutineStartTimeStr,
            durationSeconds,
            endTime: formatTimeFromDate(addSecondsToDate(parseTimeToDate(newRoutineStartTimeStr), durationSeconds)),
          };
          
          const updatedList = { ...list, routines: [...list.routines, newRoutine] };
          return updatedList; 
        }
        return list;
      })
    );
  };

  const handleUpdateRoutineDurationInList = (listId: string, routineId: string, newDurationSeconds: number) => {
    setLists(prevLists => 
        prevLists.map(list => {
            if (list.id === listId) {
                const routineIndex = list.routines.findIndex(r => r.id === routineId);
                if (routineIndex === -1) return list;

                const updatedRoutines = list.routines.map((routine, index) => {
                    if (index === routineIndex) {
                        return { ...routine, durationSeconds: newDurationSeconds };
                    }
                    return routine;
                });
                const recalculatedList = recalculateTimesInList({ ...list, routines: updatedRoutines }, routineIndex);
                
                if (activeRoutineState?.listId === listId) {
                    setActiveRoutineState(null);
                    playBeepSound(() => speakText("Timer gestoppt wegen Zeitänderungen. Bitte Routinen neu starten."));
                }
                return recalculatedList;
            }
            return list;
        })
    );
  };

  const handleUpdateListStartTime = (listId: string, newStartTimeStrWithSeconds: string) => { 
    setLists(prevLists =>
        prevLists.map(list => {
            if (list.id === listId) {
                if (list.routines.length === 0) return list;

                const updatedRoutines = list.routines.map((routine, index) => {
                    if (index === 0) {
                        return { ...routine, startTime: newStartTimeStrWithSeconds };
                    }
                    return routine;
                });
                const recalculatedList = recalculateTimesInList({ ...list, routines: updatedRoutines }, 0);
                
                if (activeRoutineState?.listId === listId) {
                    setActiveRoutineState(null);
                    playBeepSound(() => speakText("Timer gestoppt wegen Zeitänderungen. Bitte Routinen neu starten."));
                }
                return recalculatedList;
            }
            return list;
        })
    );
  };
  
  const handleDeleteRoutine = (listId: string, routineId: string) => {
    setLists(prevLists => 
        prevLists.map(list => {
            if (list.id === listId) {
                const updatedRoutines = list.routines.filter(r => r.id !== routineId);
                const routineIndex = list.routines.findIndex(r => r.id === routineId);
                const recalculatedList = recalculateTimesInList({ ...list, routines: updatedRoutines }, Math.max(0, routineIndex -1));

                if (activeRoutineState?.listId === listId) {
                    if (updatedRoutines.length === 0 || activeRoutineState.routineId === routineId) {
                        setActiveRoutineState(null);
                        playBeepSound(() => speakText("Timer gestoppt, da die aktive oder einzige Routine gelöscht wurde."));
                    } else {
                        const activeIndexStillValid = activeRoutineState.currentRoutineIndex < updatedRoutines.length;
                        if (!activeIndexStillValid || updatedRoutines[activeRoutineState.currentRoutineIndex]?.id !== activeRoutineState.routineId) {
                             setActiveRoutineState(null);
                             playBeepSound(() => speakText("Timer gestoppt aufgrund von Änderungen. Bitte neu starten."));
                        } else {
                             setActiveRoutineState(prev => prev ? {...prev, routineName: updatedRoutines[prev.currentRoutineIndex].name} : null);
                        }
                    }
                }
                return recalculatedList;
            }
            return list;
        })
    );
  };

  const handleDeleteAllRoutinesInList = (listId: string) => {
    setLists(prevLists =>
        prevLists.map(list => {
            if (list.id === listId) {
                if (activeRoutineState?.listId === listId) {
                    setActiveRoutineState(null);
                    playBeepSound(() => speakText(`Timer gestoppt, da alle Routinen aus der aktiven Liste "${list.title}" gelöscht wurden.`));
                }
                return { ...list, routines: [] };
            }
            return list;
        })
    );
  };

  const handleMoveRoutine = (cardId: string, sourceListId: string, targetListId: string, targetIndex: number) => {
    setLists(prevLists => {
        let cardToMove: Routine | undefined;
        let newLists = JSON.parse(JSON.stringify(prevLists)) as RoutineList[]; 
        
        const sourceListIdx = newLists.findIndex(l => l.id === sourceListId);
        if (sourceListIdx === -1) return prevLists;
        
        const cardIndexInSource = newLists[sourceListIdx].routines.findIndex(r => r.id === cardId);
        if (cardIndexInSource > -1) {
            [cardToMove] = newLists[sourceListIdx].routines.splice(cardIndexInSource, 1);
        }

        if (!cardToMove) return prevLists;

        const targetListIdx = newLists.findIndex(l => l.id === targetListId);
        if (targetListIdx === -1) return prevLists;

        newLists[targetListIdx].routines.splice(targetIndex, 0, cardToMove);

        if (newLists[sourceListIdx].routines.length > 0) {
            newLists[sourceListIdx] = recalculateTimesInList(newLists[sourceListIdx], 0);
        }
        newLists[targetListIdx] = recalculateTimesInList(newLists[targetListIdx], 0);


        if (activeRoutineState && (activeRoutineState.listId === sourceListId || activeRoutineState.listId === targetListId)) {
            setActiveRoutineState(null); 
            playBeepSound(() => speakText('Timer gestoppt durch Verschieben von Routinen.'));
        }
        draggedItemInfo = null; 
        return newLists;
    });
  };

  const handleToggleStartStopList = (listId: string) => {
    if (timerIdRef.current) {
      clearInterval(timerIdRef.current);
      timerIdRef.current = null;
    }
  
    if (activeRoutineState?.listId === listId) {
      setActiveRoutineState(null); 
    } else {
      const targetList = lists.find(l => l.id === listId);
      if (targetList && targetList.routines.length > 0) {
        const firstRoutine = targetList.routines[0];
        setActiveRoutineState({
          listId: listId,
          routineId: firstRoutine.id,
          currentRoutineIndex: 0,
          timeLeftInSeconds: firstRoutine.durationSeconds, 
          routineName: firstRoutine.name,
        });
      } else {
        setActiveRoutineState(null);
        if (targetList && targetList.routines.length === 0) {
          playBeepSound(() => speakText(`Liste "${targetList.title}" hat keine Routinen zum Starten.`));
        }
      }
    }
  };

  const handleDragStartList = (listId: string, index: number) => {
    setDraggedListInfo({ id: listId, originalIndex: index });
    setTimeout(() => { 
      const listElement = document.querySelector(`.routine-list[data-list-id="${listId}"]`);
      if (listElement) (listElement as HTMLElement).classList.add('dragging-list-visual');
    },0);
  };

  const handleDragEndListGlobal = () => { 
    if (draggedListInfo) {
       const listElement = document.querySelector(`.routine-list[data-list-id="${draggedListInfo.id}"]`);
       if (listElement) (listElement as HTMLElement).classList.remove('dragging-list-visual');
    }
    setDraggedListInfo(null);
    draggedItemInfo = null; 
    const placeholder = listsContainerRef.current?.querySelector('.list-dragging-placeholder');
    if (placeholder) placeholder.remove();
  };
  
  const handleDragOverListsContainer = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!draggedListInfo || !listsContainerRef.current) return;
    e.dataTransfer.dropEffect = 'move';

    const container = listsContainerRef.current;
    let placeholder = container.querySelector('.list-dragging-placeholder') as HTMLElement | null;
    if (!placeholder) {
        placeholder = document.createElement('div') as HTMLDivElement;
        placeholder.className = 'list-dragging-placeholder';
        const firstListElement = container.querySelector('.routine-list') as HTMLElement | null;
        if (firstListElement) {
            const listStyle = getComputedStyle(firstListElement);
            placeholder.style.width = listStyle.width; 
        } else {
             placeholder.style.width = '300px'; 
        }
        placeholder.style.height = '60px'; 
    }

    const listElements = Array.from(container.children).filter(
        child => child.classList.contains('routine-list') && (child as HTMLElement).dataset.listId !== draggedListInfo.id
    );

    let insertBeforeElement: Element | null = null;
    for (const listEl of listElements) {
        const rect = listEl.getBoundingClientRect();
        if (e.clientX < rect.left + rect.width / 2) {
            insertBeforeElement = listEl;
            break;
        }
    }

    if (placeholder) { 
        if (insertBeforeElement) {
            container.insertBefore(placeholder, insertBeforeElement);
        } else {
            container.appendChild(placeholder);
        }
    }
  };

  const handleDropListInContainer = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const placeholder = listsContainerRef.current?.querySelector('.list-dragging-placeholder');
    if (!draggedListInfo || !listsContainerRef.current || !placeholder) {
      handleDragEndListGlobal(); 
      return;
    }

    const childrenOfContainer = Array.from(listsContainerRef.current.children);
    let targetIndex = childrenOfContainer.indexOf(placeholder);

    if (targetIndex === -1) targetIndex = lists.length -1; 
    
    if (draggedListInfo.originalIndex !== targetIndex) {
        handleMoveList(draggedListInfo.originalIndex, targetIndex);
    }
    handleDragEndListGlobal(); 
  };

  const handleMoveList = (sourceIndex: number, targetIndexInContainer: number) => {
    setLists(prevLists => {
        const newLists = [...prevLists];
        const [movedList] = newLists.splice(sourceIndex, 1);
        if (movedList) {
          const actualTargetIndex = sourceIndex < targetIndexInContainer ? targetIndexInContainer - 1 : targetIndexInContainer;
          newLists.splice(actualTargetIndex, 0, movedList);
        }
        return newLists;
    });
  };
  
  const handleDragLeaveListsContainer = (e: DragEvent<HTMLDivElement>) => {
    if (listsContainerRef.current && !listsContainerRef.current.contains(e.relatedTarget as Node)) {
        const placeholder = listsContainerRef.current.querySelector('.list-dragging-placeholder');
        if (placeholder) placeholder.remove();
    }
  };

  const changeZoom = (delta: number) => {
    setZoomLevel(prev => {
        const newZoom = parseFloat((prev + delta).toFixed(2));
        return Math.max(0.5, Math.min(1.5, newZoom)); 
    });
  };

  const handleMouseDownToScrollArea = (event: React.MouseEvent<HTMLDivElement>) => {
    const targetElement = event.target as HTMLElement;
    const innerScroller = listsContainerRef.current;
    const outerContainer = listsOuterContainerRef.current;

    if (
      targetElement.closest('.routine-list') ||
      targetElement.closest('button') || // Catches all buttons including options, edit, start, add
      targetElement.closest('input') ||
      targetElement.closest('.options-menu') ||
      targetElement.closest('.zoom-controls') // Prevent dragging if click is on zoom controls
    ) {
      return; // Let normal interaction proceed
    }

    let canInitiateDrag = false;

    if (targetElement === outerContainer && outerContainer) {
        canInitiateDrag = true;
    } else if (targetElement === innerScroller && innerScroller) {
        const rect = innerScroller.getBoundingClientRect();
        const scrollbarHeightApproximation = 17; // Approximate height of a scrollbar
        // Check if the click (in viewport coordinates) is within the visual horizontal scrollbar area
        // rect.bottom is the bottom of the scaled element. zoomLevel scales the content AND the scrollbar visually.
        if (event.clientY < rect.bottom && event.clientY >= rect.bottom - (scrollbarHeightApproximation * zoomLevel) ) {
            canInitiateDrag = false; // Clicked on scrollbar
        } else {
            canInitiateDrag = true; // Clicked on inner scroller's background/padding
        }
    }

    if (!canInitiateDrag || !innerScroller) {
        return;
    }

    event.preventDefault(); // Prevent text selection ONLY if we are starting a drag scroll
    isBackgroundDraggingRef.current = true;
    backgroundDragStartXRef.current = event.pageX;
    backgroundScrollLeftStartRef.current = innerScroller.scrollLeft;

    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    document.addEventListener('mousemove', handleMouseMoveDocument);
    document.addEventListener('mouseup', handleMouseUpDocument);
  };

  const handleMouseMoveDocument = (event: MouseEvent) => {
    if (!isBackgroundDraggingRef.current || !listsContainerRef.current) return;
    event.preventDefault(); // Good to have here too
    const dx = event.pageX - backgroundDragStartXRef.current;
    listsContainerRef.current.scrollLeft = backgroundScrollLeftStartRef.current - dx;
  };

  const handleMouseUpDocument = () => {
    if (!isBackgroundDraggingRef.current) return;
    isBackgroundDraggingRef.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', handleMouseMoveDocument);
    document.removeEventListener('mouseup', handleMouseUpDocument);
  };


  return (
    <div className="app-container" onDragEnd={handleDragEndListGlobal} >
      <header className="app-header">
        <h1>Routinen Planer</h1>
        <div className="zoom-controls">
            <button onClick={() => changeZoom(-0.1)} aria-label="Zoom Out">-</button>
            <button onClick={() => setZoomLevel(1.0)} aria-label="Reset Zoom">Reset</button>
            <button onClick={() => changeZoom(0.1)} aria-label="Zoom In">+</button>
            <span className="zoom-level-display">{(zoomLevel * 100).toFixed(0)}%</span>
        </div>
      </header>
      <main>
        <form onSubmit={handleAddList} className="add-list-form">
          <input type="text" value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="Neue Listenüberschrift..." aria-label="Neue Listenüberschrift" />
          <button type="submit">Liste hinzufügen</button>
        </form>
        <div 
          className="lists-outer-container"
          ref={listsOuterContainerRef}
          onMouseDown={handleMouseDownToScrollArea}
        >
          <div
            className="lists-container"
            ref={listsContainerRef}
            onDragOver={handleDragOverListsContainer}
            onDrop={handleDropListInContainer}
            onDragLeave={handleDragLeaveListsContainer}
            style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }}
          >
            {lists.map((list, index) => (
              <RoutineListComponent
                key={list.id}
                list={list}
                listIndex={index}
                isBeingDragged={draggedListInfo?.id === list.id}
                onAddRoutine={handleAddRoutineToList}
                onMoveRoutine={handleMoveRoutine}
                activeRoutineState={activeRoutineState}
                onToggleStartStopList={handleToggleStartStopList}
                onUpdateListStartTime={handleUpdateListStartTime}
                onUpdateRoutineDurationInList={handleUpdateRoutineDurationInList}
                onDeleteRoutineInList={handleDeleteRoutine}
                onDeleteAllRoutinesInList={handleDeleteAllRoutinesInList}
                onDragStartList={handleDragStartList}
                onDragEndList={handleDragEndListGlobal} 
                isSomethingDragging={!!draggedItemInfo || !!draggedListInfo}
              />
            ))}
          </div>
        </div>
      </main>
      <footer className="app-footer">
        <p>&copy; {new Date().getFullYear()} Routinen Planer App</p>
      </footer>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);