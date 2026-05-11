export const sv = {
  // Common actions
  save: 'Spara',
  saving: 'Sparar…',
  cancel: 'Avbryt',
  edit: 'Redigera',
  delete: 'Ta bort',
  add: 'Lägg till',
  adding: 'Lägger till…',
  create: 'Skapa',
  creating: 'Skapar…',
  rename: 'Byt namn',
  assign: 'Tilldela',
  disconnect: 'Koppla bort',
  close: 'Stäng',
  send: 'Skicka',
  sending: 'Skickar…',
  clearAction: 'Rensa',
  clearing: 'Rensar…',
  apply: 'Tillämpa',
  applying: 'Tillämpar…',

  // Common labels
  name: 'Namn',
  priority: 'Prioritet',
  online: 'Online',
  offline: 'Offline',
  active: 'Aktiv',
  inactive: 'Inaktiv',
  actions: 'Åtgärder',
  tag: 'Tagg',
  cannotBeUndone: 'Detta går inte att ångra.',

  // Navigation
  navRally: 'Rally',
  navRallycross: 'Rallycross',
  navResults: 'Resultat',
  navChampionships: 'Mästerskap',
  navRules: 'Regler',
  navAbout: 'Om',
  navDrivers: 'Förare',
  navClasses: 'Klasser',
  navGates: 'Grindar',
  logout: 'Logga ut',
  login: 'Logga in',
  logoAlt: 'Rally Timer-logotyp',
  editTitle: 'Redigera titel',

  // Dark mode
  toggleDarkMode: 'Växla mörkt läge',

  // PageContent
  saveFailed: 'Sparning misslyckades',

  // Rally results
  rallyLeaderboard: 'Resultatlista Rally',
  stageLeaderboard: 'Resultatlista Sträcka',
  totalLabel: 'Totalt',
  stagesStatLabel: 'Sträckor',
  penaltyLabel: 'Tillägg',
  timeLabel: 'Tid',
  noResultsYet: 'Inga resultat än.',
  noStagesYet: 'Inga sträckor än.',
  noStageResultsYet: 'Inga sträckaresultat än.',

  // Championships page
  noChampionshipsYet: 'Inga mästerskap än.',
  createFirstChampionship: 'Skapa ditt första mästerskap',
  renameChampionshipTitle: 'Byt namn på mästerskap',
  deleteChampionshipTitle: 'Ta bort mästerskap',
  newChampionship: 'Nytt mästerskap',
  championshipName: 'Mästerskapsnamn',
  loadingStandings: 'Laddar tabell…',
  noResultsSubmitRally: 'Inga resultat än. Skicka in ett rally för att se tabellen.',
  goToManage: 'Gå till Hantera →',
  driverHeader: 'Förare',
  pointsHeader: 'Poäng',
  deleteChampionshipConfirm: (name: string) =>
    `Ta bort mästerskapet "${name}"? Detta går inte att ångra.`,
  removeRallyFromChampionshipConfirm: (name: string) =>
    `Ta bort rallyt "${name}" från det här mästerskapet?`,

  // Classes page
  addClass: 'Lägg till klass',
  classesHeading: 'Klasser',
  className: 'Klassnamn',
  startPriorityTitle: 'Startprioritet — högre nummer startar först',
  startPriorityHigherNote: 'Högre nummer = startar först',
  startPriorityAriaLabel: 'Startprioritet',
  deleteClassConfirm: (name: string, driverWarning: string) =>
    `Ta bort klassen "${name}"?${driverWarning}\n\nInskickade rallyresultat bevaras.`,
  deleteClassDriverWarning: (count: number) =>
    `\n\nDetta tar även bort ${count} förare och deras pågående starttider.`,
  failedStatus: (status: number) => `Misslyckades (${status})`,

  // Drivers page
  addDriver: 'Lägg till förare',
  driverName: 'Namn',
  classLabel: 'Klass',
  selectClass: 'Välj klass…',
  rfidTag: 'RFID-tagg',
  waitingForGate: 'Väntar på grind...',
  scanTag: 'Skanna tagg…',
  gateCapture: 'Grindfångst',
  manualEntry: 'Manuell inmatning',
  addAutomatically: 'Lägg till automatiskt',
  lastCaptured: 'Senast fångad:',
  cancelCapture: 'Avbryt fångst',
  driversHeading: 'Förare',
  clearAll: 'Rensa alla',
  driverClassAriaLabel: 'Förarklass',

  // Gates page
  justNow: 'just nu',
  agoSuffix: 'sedan',
  enterGateName: 'Ange nytt namn på grinden:',
  unassignGateConfirm: (name: string) => `Koppla bort grinden "${name}" från sträckan?`,
  deleteGateConfirm: (name: string) => `Ta bort grinden "${name}"? Detta går inte att ångra.`,
  registeredGates: 'Registrerade grindar',
  autoUpdates: 'Uppdateras automatiskt var 5:e sekund',
  noGatesRegistered: 'Inga grindar registrerade. Grindar visas här när de ansluter.',
  statusHeader: 'Status',
  nameIdHeader: 'Namn / ID',
  assignedStageHeader: 'Tilldelad sträcka',
  lastSeenHeader: 'Senast sedd',
  unassigned: 'Ej tilldelad',
  livePassageConsole: 'Live passagekonsol',
  passageConsoleDescription:
    'Varje grindpassage visas här i realtid. Vifta med en RFID-tagg vid en grind för att testa skanning — raden för grinden ovan blinkar och en post läggs till nedan med dess RSSI.',
  waitingForPassages: 'Väntar på grindpassager…',
  noRssi: 'ingen RSSI',

  // Rallies page
  deleteStageConfirm: 'Ta bort denna sträcka? Detta tar även bort alla dess händelser.',
  closeStageConfirm:
    'Stäng denna sträcka?\n\n• DNF-tilläggstider tilldelas förare utan målgång.\n• Grinden kopplas bort och flyttas till nästa sträcka.',
  gateMovedToStage: (id: number) => ` Grinden flyttades till sträcka #${id}.`,
  stageClosedStatus: (count: number, moved: string) =>
    `Sträcka stängd — ${count} DNF-tillägg tilldelat.${moved}`,
  errorPrefix: 'Fel:',
  unassignGateFromStageConfirm: (name: string) =>
    `Koppla bort grinden "${name}" från denna sträcka?`,
  currentRally: 'Aktuellt rally',
  activeDriversButton: 'Aktiva förare',
  penaltyButton: 'Tillägg',
  submitToChampionshipButton: 'Skicka till mästerskap',
  clearRallyButton: 'Rensa rally',
  stagesHeading: 'Sträckor',
  stageNameAriaLabel: 'Sträckanamn',
  disconnectGateTitle: 'Koppla bort grind',
  renameStageTitle: 'Byt namn på sträcka',
  noGateAssigned: 'Ingen grind tilldelad',
  openStartTitle: 'Öppna start',
  selectGateFirst: 'Välj grind först',
  closeStageButton: 'Stäng sträcka',
  eventsButton: 'Händelser',
  addStage: 'Lägg till',
  applyFailed: 'Misslyckades:',
  clearFailed: 'Rensning misslyckades:',
  submitFailed: 'Inskickning misslyckades:',

  // Penalty modal
  penaltyModal: 'Tillägg',
  stageLabel: 'Sträcka',
  driverLabel: 'Förare',
  noFinishers: 'Inga målgångare på denna sträcka.',
  penaltySeconds: 'Tillägg (sekunder)',
  currentPenaltyPrefix: 'nuvarande:',
  removePenaltyHint: 'Sätt till 0 för att ta bort tillägget.',
  removePenalty: 'Ta bort tillägg',
  applyPenalty: 'Tillämpa tillägg',

  // Active drivers modal
  activeDriversModal: 'Aktiva förare',
  searchDriversPlaceholder: 'Sök förare...',
  noMatches: 'Inga träffar.',
  noDrivers: 'Inga förare.',
  manageAddDrivers: 'Hantera / lägg till förare →',

  // Clear rally modal
  clearRallyModal: 'Rensa rally',
  clearRallyDescription:
    'Detta tar bort alla sträckor och deras händelser. Förare och grindar behålls. Inskickade rallyn påverkas inte.',

  // Submit to championship modal
  submitRallyModal: 'Skicka rally till mästerskap',
  rallySubmitted: 'Rally inskickat!',
  viewChampionships: 'Visa mästerskap →',
  rallyNameLabel: 'Rallynamn',
  rallyNamePlaceholder: 't.ex. Rally Finland 2026',
  submitToChampionshipLabel: 'Skicka till mästerskap',
  noChampionshipsYetCreate: 'Inga mästerskap än.',
  createOne: 'Skapa ett →',

  // Stage events page
  eventsForStage: (name: string) => `Händelser för ${name}`,
  noGateAssignedWarning:
    'Ingen grind tilldelad. Tilldela en grind från Sträckor-sidan för att ta emot RFID-händelser automatiskt.',
  typeHeader: 'Typ',
  timestampHeader: 'Tidsstämpel (lokal)',
  epochHeader: 'Epoch ms',
  driverTagHeader: 'Förare (tagg)',
  rssiHeader: 'RSSI',
  timestampAriaLabel: 'Tidsstämpel',
  noEventsYet: 'Inga händelser än.',
  invalidDatetime: 'Ogiltigt datum/tid.',
  deleteEventConfirm: (kind: string, id: number) => `Ta bort ${kind} #${id}?`,
  kindFinish: 'Mål',
  kindStart: 'Start',

  // Stage start page
  activeClassLabel: 'Aktiv klass:',
  remainingLabel: 'kvar',
  noMoreDrivers: 'Inga fler förare',
  upNext: 'Näst på tur',
  startOrder: 'Startordning',
  driverColumn: 'Förare',
  classColumn: 'Klass',
  gapSecondsLabel: 'Mellanrum (s)',
  noGateForStage: 'Ingen grind tilldelad till denna sträcka.',
  startButton: 'Start',
  pauseButton: 'Pausa',
  resumeButton: 'Återuppta',
  restartButton: 'Starta om',
  startWholeClassLabel: 'Starta hela klassen samtidigt',
  speechClassDone: (cls: string, next: string) => `Klass ${cls} klar. Nästa klass: ${next}`,
  speechNextDriver: (name: string) => `Nästa förare: ${name}`,
  speechNextClass: (cls: string, count: number) => `Nästa klass: ${cls}, ${count} förare`,
  speechNoMoreDrivers: 'Inga fler förare',
  speechGo: 'kör',

  // Rallycross - common
  rxHeading: 'Rallycross',
  rxStatusNotStarted: 'Ej startat',
  rxStatusInProgress: 'Pågår',
  rxStatusDone: 'Klar',
  rxStatusHeatInProgress: (n: number) => `Heat ${n} pågår`,
  rxStatusHeatsRun: (n: number) => `${n} heat körda`,
  rxHeatLabel: (n: number) => `Heat ${n}`,

  // Rallycross - config
  rxFinishGate: 'Mållinjegrind',
  rxChooseGate: '— Välj grind —',
  rxCooldownLabel: 'Cooldown (s)',
  rxMaxPerHeat: 'Max per heat',
  rxLapsLabel: 'Varv',
  rxSaveSettings: 'Spara inställningar',
  rxManageHeats: 'Hantera heat →',
  rxAssignGateFirst: 'Tilldela en grind för att hantera heat.',
  rxConfigSummary: (gate: string, cooldown: number, max: number, laps: number) =>
    `Grind: ${gate} · Cooldown: ${cooldown}s · Max per heat: ${max} · Varv: ${laps}`,

  // Rallycross - leaderboard / heat list
  rxHeatsHeading: 'Heat',
  rxOverallStandings: 'Sammanlagd ställning',
  rxBestTime: 'Bästa tid',
  rxBestLap: 'Bästa varv',
  rxHeatColumn: 'Heat',
  rxWaitingForHeats: 'Väntar på att heat ska köras.',

  // Rallycross - clear modal
  rxClearHeading: 'Rensa rallycross',
  rxClearDescription: 'Alla heat och resultat tas bort. Grinden och dess händelser behålls.',
  rxSaveFailed: 'Kunde inte spara: ',
  rxClearFailed: 'Kunde inte rensa: ',

  // Rallycross - heat management page (start/)
  rxBack: 'Tillbaka',
  rxManageHeatsHeading: 'Hantera heat',
  rxCloseHeat: 'Stäng heat',
  rxClosingHeat: 'Stänger…',
  rxRequiredLaps: (n: number) => `Krav: ${n} varv`,
  rxWaitingForDrivers: 'Väntar på förare att passera grinden…',
  rxLapsColumn: 'Varv',
  rxStartHeat: 'Starta heat',
  rxStartingHeat: 'Startar…',
  rxAssignGateBeforeStart: 'Tilldela en grind i inställningar innan start.',
  rxCreateNextHeat: 'Skapa nästa heat',
  rxSuggestedGroups: 'Förslag baserat på ställning:',
  rxGroupLabel: (n: number) => `Grupp ${n}`,
  rxSelectDrivers: (selected: number, max: number) => `Välj förare (${selected} av max ${max}):`,
  rxTooManyDrivers: (max: number) => `Max ${max} förare per heat. Avmarkera några.`,
  rxCreateHeat: (n: number) => `Skapa heat (${n} förare)`,
  rxCompletedHeats: 'Genomförda heat',
  rxCloseHeatTitle: 'Stäng heat',
  rxCloseHeatDescription: (laps: number) =>
    `Förare som inte slutfört ${laps} varv får DNF-tid (snabbaste fullbordade + 30 s).`,
  rxCreateFailed: 'Kunde inte skapa heat: ',
  rxStartFailed: 'Kunde inte starta heat: ',
  rxCloseFailed: 'Kunde inte stänga heat: ',
  rxHeatCount: (n: number) => `${n} heat${n !== 1 ? 's' : ''}`
};

export const en: typeof sv = {
  // Common actions
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  edit: 'Edit',
  delete: 'Delete',
  add: 'Add',
  adding: 'Adding…',
  create: 'Create',
  creating: 'Creating…',
  rename: 'Rename',
  assign: 'Assign',
  disconnect: 'Disconnect',
  close: 'Close',
  send: 'Send',
  sending: 'Sending…',
  clearAction: 'Clear',
  clearing: 'Clearing…',
  apply: 'Apply',
  applying: 'Applying…',

  // Common labels
  name: 'Name',
  priority: 'Priority',
  online: 'Online',
  offline: 'Offline',
  active: 'Active',
  inactive: 'Inactive',
  actions: 'Actions',
  tag: 'Tag',
  cannotBeUndone: 'This cannot be undone.',

  // Navigation
  navRally: 'Rally',
  navRallycross: 'Rallycross',
  navResults: 'Results',
  navChampionships: 'Championships',
  navRules: 'Rules',
  navAbout: 'About',
  navDrivers: 'Drivers',
  navClasses: 'Classes',
  navGates: 'Gates',
  logout: 'Log out',
  login: 'Log in',
  logoAlt: 'Rally Timer logo',
  editTitle: 'Edit title',

  // Dark mode
  toggleDarkMode: 'Toggle dark mode',

  // PageContent
  saveFailed: 'Save failed',

  // Rally results
  rallyLeaderboard: 'Rally leaderboard',
  stageLeaderboard: 'Stage leaderboard',
  totalLabel: 'Total',
  stagesStatLabel: 'Stages',
  penaltyLabel: 'Penalty',
  timeLabel: 'Time',
  noResultsYet: 'No results yet.',
  noStagesYet: 'No stages yet.',
  noStageResultsYet: 'No stage results yet.',

  // Championships page
  noChampionshipsYet: 'No championships yet.',
  createFirstChampionship: 'Create your first championship',
  renameChampionshipTitle: 'Rename championship',
  deleteChampionshipTitle: 'Delete championship',
  newChampionship: 'New championship',
  championshipName: 'Championship name',
  loadingStandings: 'Loading standings…',
  noResultsSubmitRally: 'No results yet. Submit a rally to see the standings.',
  goToManage: 'Go to Manage →',
  driverHeader: 'Driver',
  pointsHeader: 'Points',
  deleteChampionshipConfirm: (name: string) =>
    `Delete championship "${name}"? This cannot be undone.`,
  removeRallyFromChampionshipConfirm: (name: string) =>
    `Remove rally "${name}" from this championship?`,

  // Classes page
  addClass: 'Add class',
  classesHeading: 'Classes',
  className: 'Class name',
  startPriorityTitle: 'Start priority — higher number starts first',
  startPriorityHigherNote: 'Higher number = starts first',
  startPriorityAriaLabel: 'Start priority',
  deleteClassConfirm: (name: string, driverWarning: string) =>
    `Delete class "${name}"?${driverWarning}\n\nSubmitted rally results are preserved.`,
  deleteClassDriverWarning: (count: number) =>
    `\n\nThis will also delete ${count} driver(s) and their active start times.`,
  failedStatus: (status: number) => `Failed (${status})`,

  // Drivers page
  addDriver: 'Add driver',
  driverName: 'Driver name',
  classLabel: 'Class',
  selectClass: 'Select class…',
  rfidTag: 'RFID tag',
  waitingForGate: 'Waiting for gate...',
  scanTag: 'Scan tag…',
  gateCapture: 'Gate capture',
  manualEntry: 'Manual entry',
  addAutomatically: 'Add automatically',
  lastCaptured: 'Last captured:',
  cancelCapture: 'Cancel capture',
  driversHeading: 'Drivers',
  clearAll: 'Clear all',
  driverClassAriaLabel: 'Driver class',

  // Gates page
  justNow: 'just now',
  agoSuffix: 'ago',
  enterGateName: 'Enter new name for the gate:',
  unassignGateConfirm: (name: string) => `Disconnect gate "${name}" from the stage?`,
  deleteGateConfirm: (name: string) => `Delete gate "${name}"? This cannot be undone.`,
  registeredGates: 'Registered gates',
  autoUpdates: 'Auto-updates every 5 seconds',
  noGatesRegistered: 'No gates registered. Gates appear here when they connect.',
  statusHeader: 'Status',
  nameIdHeader: 'Name / ID',
  assignedStageHeader: 'Assigned stage',
  lastSeenHeader: 'Last seen',
  unassigned: 'Unassigned',
  livePassageConsole: 'Live passage console',
  passageConsoleDescription:
    'Every gate passage is shown here in real time. Wave an RFID tag at a gate to test scanning — the gate row above flashes and an entry is added below with its RSSI.',
  waitingForPassages: 'Waiting for gate passages…',
  noRssi: 'no RSSI',

  // Rallies page
  deleteStageConfirm: 'Delete this stage? This will also delete all its events.',
  closeStageConfirm:
    'Close this stage?\n\n• DNF time penalties will be assigned to drivers without a finish.\n• The gate will be disconnected and moved to the next stage.',
  gateMovedToStage: (id: number) => ` Gate moved to stage #${id}.`,
  stageClosedStatus: (count: number, moved: string) =>
    `Stage closed — ${count} DNF penalty/penalties assigned.${moved}`,
  errorPrefix: 'Error:',
  unassignGateFromStageConfirm: (name: string) => `Disconnect gate "${name}" from this stage?`,
  currentRally: 'Current rally',
  activeDriversButton: 'Active drivers',
  penaltyButton: 'Penalty',
  submitToChampionshipButton: 'Submit to championship',
  clearRallyButton: 'Clear rally',
  stagesHeading: 'Stages',
  stageNameAriaLabel: 'Stage name',
  disconnectGateTitle: 'Disconnect gate',
  renameStageTitle: 'Rename stage',
  noGateAssigned: 'No gate assigned',
  openStartTitle: 'Open start',
  selectGateFirst: 'Select gate first',
  closeStageButton: 'Close stage',
  eventsButton: 'Events',
  addStage: 'Add stage',
  applyFailed: 'Failed:',
  clearFailed: 'Clear failed:',
  submitFailed: 'Submit failed:',

  // Penalty modal
  penaltyModal: 'Penalty',
  stageLabel: 'Stage',
  driverLabel: 'Driver',
  noFinishers: 'No finishers on this stage.',
  penaltySeconds: 'Penalty (seconds)',
  currentPenaltyPrefix: 'current:',
  removePenaltyHint: 'Set to 0 to remove the penalty.',
  removePenalty: 'Remove penalty',
  applyPenalty: 'Apply penalty',

  // Active drivers modal
  activeDriversModal: 'Active drivers',
  searchDriversPlaceholder: 'Search drivers...',
  noMatches: 'No matches.',
  noDrivers: 'No drivers.',
  manageAddDrivers: 'Manage / add drivers →',

  // Clear rally modal
  clearRallyModal: 'Clear rally',
  clearRallyDescription:
    'This will delete all stages and their events. Drivers and gates are kept. Submitted rallies are not affected.',

  // Submit to championship modal
  submitRallyModal: 'Submit rally to championship',
  rallySubmitted: 'Rally submitted!',
  viewChampionships: 'View championships →',
  rallyNameLabel: 'Rally name',
  rallyNamePlaceholder: 'e.g. Rally Finland 2026',
  submitToChampionshipLabel: 'Submit to championship',
  noChampionshipsYetCreate: 'No championships yet.',
  createOne: 'Create one →',

  // Stage events page
  eventsForStage: (name: string) => `Events for ${name}`,
  noGateAssignedWarning:
    'No gate assigned. Assign a gate from the Stages page to receive RFID events automatically.',
  typeHeader: 'Type',
  timestampHeader: 'Timestamp (local)',
  epochHeader: 'Epoch ms',
  driverTagHeader: 'Driver (tag)',
  rssiHeader: 'RSSI',
  timestampAriaLabel: 'Timestamp',
  noEventsYet: 'No events yet.',
  invalidDatetime: 'Invalid date/time.',
  deleteEventConfirm: (kind: string, id: number) => `Delete ${kind} #${id}?`,
  kindFinish: 'Finish',
  kindStart: 'Start',

  // Stage start page
  activeClassLabel: 'Active class:',
  remainingLabel: 'remaining',
  noMoreDrivers: 'No more drivers',
  upNext: 'Up next',
  startOrder: 'Start order',
  driverColumn: 'Driver',
  classColumn: 'Class',
  gapSecondsLabel: 'Gap (s)',
  noGateForStage: 'No gate assigned to this stage.',
  startButton: 'Start',
  pauseButton: 'Pause',
  resumeButton: 'Resume',
  restartButton: 'Restart',
  startWholeClassLabel: 'Start whole class together',
  speechClassDone: (cls: string, next: string) => `Class ${cls} done. Next class: ${next}`,
  speechNextDriver: (name: string) => `Next driver: ${name}`,
  speechNextClass: (cls: string, count: number) => `Next class: ${cls}, ${count} drivers`,
  speechNoMoreDrivers: 'No more drivers',
  speechGo: 'go',

  // Rallycross - common
  rxHeading: 'Rallycross',
  rxStatusNotStarted: 'Not started',
  rxStatusInProgress: 'In progress',
  rxStatusDone: 'Done',
  rxStatusHeatInProgress: (n: number) => `Heat ${n} in progress`,
  rxStatusHeatsRun: (n: number) => `${n} heat${n === 1 ? '' : 's'} run`,
  rxHeatLabel: (n: number) => `Heat ${n}`,

  // Rallycross - config
  rxFinishGate: 'Finish line gate',
  rxChooseGate: '— Choose gate —',
  rxCooldownLabel: 'Cooldown (s)',
  rxMaxPerHeat: 'Max per heat',
  rxLapsLabel: 'Laps',
  rxSaveSettings: 'Save settings',
  rxManageHeats: 'Manage heats →',
  rxAssignGateFirst: 'Assign a gate to manage heats.',
  rxConfigSummary: (gate: string, cooldown: number, max: number, laps: number) =>
    `Gate: ${gate} · Cooldown: ${cooldown}s · Max per heat: ${max} · Laps: ${laps}`,

  // Rallycross - leaderboard / heat list
  rxHeatsHeading: 'Heats',
  rxOverallStandings: 'Overall standings',
  rxBestTime: 'Best time',
  rxBestLap: 'Best lap',
  rxHeatColumn: 'Heat',
  rxWaitingForHeats: 'Waiting for heats to run.',

  // Rallycross - clear modal
  rxClearHeading: 'Clear rallycross',
  rxClearDescription: 'All heats and results will be removed. The gate and its events are kept.',
  rxSaveFailed: 'Could not save: ',
  rxClearFailed: 'Could not clear: ',

  // Rallycross - heat management page (start/)
  rxBack: 'Back',
  rxManageHeatsHeading: 'Manage heats',
  rxCloseHeat: 'Close heat',
  rxClosingHeat: 'Closing…',
  rxRequiredLaps: (n: number) => `Required: ${n} lap${n === 1 ? '' : 's'}`,
  rxWaitingForDrivers: 'Waiting for drivers to pass the gate…',
  rxLapsColumn: 'Laps',
  rxStartHeat: 'Start heat',
  rxStartingHeat: 'Starting…',
  rxAssignGateBeforeStart: 'Assign a gate in settings before starting.',
  rxCreateNextHeat: 'Create next heat',
  rxSuggestedGroups: 'Suggested groups based on standings:',
  rxGroupLabel: (n: number) => `Group ${n}`,
  rxSelectDrivers: (selected: number, max: number) => `Select drivers (${selected} of max ${max}):`,
  rxTooManyDrivers: (max: number) => `Max ${max} drivers per heat. Deselect some.`,
  rxCreateHeat: (n: number) => `Create heat (${n} driver${n === 1 ? '' : 's'})`,
  rxCompletedHeats: 'Completed heats',
  rxCloseHeatTitle: 'Close heat',
  rxCloseHeatDescription: (laps: number) =>
    `Drivers who have not completed ${laps} lap${laps === 1 ? '' : 's'} will receive a DNF time (fastest finisher + 30 s).`,
  rxCreateFailed: 'Could not create heat: ',
  rxStartFailed: 'Could not start heat: ',
  rxCloseFailed: 'Could not close heat: ',
  rxHeatCount: (n: number) => `${n} heat${n !== 1 ? 's' : ''}`
};
