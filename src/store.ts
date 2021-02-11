import { writable, get, derived } from 'svelte/store';
import { getVoteResultPayload } from './wsHelper';
import { UpdatePlayerMessage, Message, SettingTopicResponse, GetWordResponse, InGameResponse, VoteUpdateResponse, VoteResultResponse, VoteResult, Status, GuessWordResponse } from './wsTypes';

export const playerStore = writable<string[]>([]);
export const playerId = writable('');
export const undercoverCount = writable(0);
export const mrWhiteCount = writable(0);
export const connectionOpened = writable(false);
export const ownWord = writable('init');
export const playingState = writable('init');
export const playerToWords = writable<[string, string[]][]>([]);
export const currentPlayerTurn = writable('');
export const votedOutPlayers = writable([]);
export const mrWhiteGuessStatus = writable('');
export const currentTurn = writable(0);
export const voteResult = writable<VoteResult>({
  turn: 0,
  result: 'DRAW',
  gameState: Status.PLAYING
});
export const playersWhoVoted = writable([]);
export const isMrWhite = derived(
  ownWord,
  ($ownWord) => $ownWord === ''
);
export const hasVoted = derived(
  [playersWhoVoted, playerId],
	([$playersWhoVoted, $playerId]) => $playersWhoVoted.indexOf($playerId) !== -1
);
export const playerLost = derived(
  [votedOutPlayers, playerId],
  ([$votedOutPlayers, $playerId]) => $votedOutPlayers.indexOf($playerId) !== -1
);

export const stillInGamePlayers = derived(
  [votedOutPlayers, playerStore],
  ([$votedOutPlayers, $playerStore]) => $playerStore.filter((p) => $votedOutPlayers.indexOf(p) === -1)
)

export const usedWords = derived(
  playerToWords,
  ($playerToWords) => {
    return new Set($playerToWords.reduce((acc, pToWords) => {
      return acc.concat(pToWords[1].map(word => word.toLowerCase()));
    }, []))
  }
);

export const yourTurn = derived(
  [currentPlayerTurn, playerId],
  ([$currentPlayerTurn, $playerId]) => $currentPlayerTurn === $playerId
);

// TODO put ws url into env variable, possible bug in Vercel
// @ts-ignore
console.log('process + ' + process.env.API_URL);
// @ts-ignore
const socket = new WebSocket("ws://localhost:3000");

socket.addEventListener('open', () => connectionOpened.set(true));

socket.addEventListener('message', onMessageEvent);

function onMessageEvent(event) {
  const resp: Message = JSON.parse(event.data);
  if (resp.topic === 'player') {
    if (resp.subtopic === 'update') {
      const addPlayerResponse = resp as UpdatePlayerMessage;
      updatePlayerStore(addPlayerResponse);
    }
  } else if (resp.topic === 'settings') {
    const settingsResponse = resp as SettingTopicResponse;
    updateSettings(settingsResponse);
  } else if (resp.topic === 'game') {
    if (resp.subtopic === 'word') {
      const getWordResp = resp as GetWordResponse;
      ownWord.set(getWordResp.data);
      playingState.set('started');
    } else if (resp.subtopic === 'update') {
      const inGameResponse = resp as InGameResponse;
      const data = inGameResponse.data;
      playerToWords.set(data.playerToWords);
      currentTurn.set(data.turn);
      currentPlayerTurn.set(data.player);
      if (data.state === Status.VOTING) {
        console.log(`Switching to voting mode!
        playingState: ${get(playingState)},
        hasVoted: ${get(hasVoted)},
        playersWhoVoted: ${get(playersWhoVoted)}
        `);
        playingState.set('voting');
      }
    }
  } else if (resp.topic === 'vote') {
    if (resp.subtopic === 'update') {
      const response = resp as VoteUpdateResponse;
      console.log(`Updating playersWhoVoted ${get(playersWhoVoted)}`);
      console.log(`hasVoted ${get(hasVoted)}`);
      playersWhoVoted.set(response.data.playersWhoVoted);
      console.log(`Updated playersWhoVoted ${get(playersWhoVoted)}`);
      console.log(`hasVoted ${get(hasVoted)}`);
      if (response.data.state === Status.FINISHED_VOTING || response.data.state === Status.MR_WHITE_GUESS_WAITING) {
        sendMessage(getVoteResultPayload());
      }
    } else if (resp.subtopic === 'result') {
      const response = resp as VoteResultResponse;
      voteResult.set(response.data);
      playingState.set('result');
    } else if (resp.subtopic === 'guess') {
      const response = resp as GuessWordResponse;
      let newVoteResult = get(voteResult);
      newVoteResult.gameState = response.data;
      voteResult.set(newVoteResult);
    }
  }
  console.log(`Logging stores after message
  playingState: ${get(playingState)},
  voteResult: ${JSON.stringify(get(voteResult))},
  currentTurn: ${get(currentTurn)},
  playersWhoVoted: ${get(playersWhoVoted)},
  votedOutPlayers: ${get(votedOutPlayers)},
  playerLost: ${get(playerLost)},
  `)
}

function updateSettings(resp: SettingTopicResponse) {
  const data = resp.data;
  undercoverCount.set(data.underCoverCount);
  mrWhiteCount.set(data.mrWhiteCount);
}

function updatePlayerStore(resp: UpdatePlayerMessage) {
  playerStore.set(resp.data);
}

export const sendMessage = (message) => {
  if (get(connectionOpened)) {
    socket.send(JSON.stringify(message));
  }
}
