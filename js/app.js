import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getDatabase, ref, set, get, onValue } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCp0rEJd4MU_ln50Pn-ifeFdOjltbdHs7g",
  authDomain: "chess-2-ab26c.firebaseapp.com",
  databaseURL: "https://chess-2-ab26c-default-rtdb.firebaseio.com",
  projectId: "chess-2-ab26c",
  storageBucket: "chess-2-ab26c.firebasestorage.app",
  messagingSenderId: "488467684621",
  appId: "1:488467684621:web:e319e71c80e1a839f7a444",
};

const firebaseApp = initializeApp(firebaseConfig);
const firebaseDb = getDatabase(firebaseApp);
const FIREBASE_SAVES_ROOT = "chess2/saves";
const LAST_GAME_NAME_STORAGE_KEY = "chess2:lastGameName";
const RESTORE_ON_RELOAD_STORAGE_KEY = "chess2:restoreOnReload";
const POWERUP_SOUND_PATH = "Sounds/Lightsaber.mp3";
const POWERUP_LIGHTNING_DURATION_MS = 900;
const CHECKMATE_SOUND_PATH = "Sounds/ode-to-joy.mp3";
const STALEMATE_SOUND_PATH = "Sounds/roblox_oof.mp3";

function sanitizeGameName(rawName) {
  if (typeof rawName !== "string") {
    return "";
  }
  return rawName.trim().replace(/\s+/g, " ");
}

function toFirebaseSaveKey(gameName) {
  const normalized = sanitizeGameName(gameName).toLowerCase();
  if (!normalized) {
    return "";
  }

  // Firebase keys cannot contain . # $ [ ] /
  return normalized.replace(/[.#$\[\]/]/g, "_");
}

function getGameStateRefByName(gameName) {
  const key = toFirebaseSaveKey(gameName);
  return key ? ref(firebaseDb, `${FIREBASE_SAVES_ROOT}/${key}`) : null;
}

function rememberGameName(gameName) {
  const normalized = sanitizeGameName(gameName);
  if (!normalized) {
    return;
  }

  try {
    window.localStorage.setItem(LAST_GAME_NAME_STORAGE_KEY, normalized);
  } catch {
    // Ignore storage errors and continue without remembered save support.
  }
}

function getRememberedGameName() {
  try {
    const stored = window.localStorage.getItem(LAST_GAME_NAME_STORAGE_KEY);
    return sanitizeGameName(stored || "");
  } catch {
    return "";
  }
}

function shouldRestoreSavedGameOnReload() {
  try {
    return window.sessionStorage.getItem(RESTORE_ON_RELOAD_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function setRestoreSavedGameOnReload(enabled) {
  try {
    if (enabled) {
      window.sessionStorage.setItem(RESTORE_ON_RELOAD_STORAGE_KEY, "1");
    } else {
      window.sessionStorage.removeItem(RESTORE_ON_RELOAD_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors and continue.
  }
}

//Typ waluigi for board editor
//Press \ (backslash) in-game
// Prompt opens to enter:
// just number: 44 (applies to current turn side)
// number + side: 44 b or 44 w


class ChessGame {
  constructor() {
    this.promotionOptions = ["queen", "rook", "bishop", "knight"];
    this.customStartingBoard = null;
    this.reset();
  }

  reset() {
    this.customStartingBoard = null;
    this.board = this.createInitialBoard();
    this.lostPieces = { white: [], black: [] };
    this.castlingRights = this.createInitialCastlingRights();
    this.bonusMove = null;
    this.pendingBonusTurns = { white: 0, black: 0 };
    this.safePassageShields = { white: null, black: null };
    this.turn = "white";
    this.winner = null;
    this.gameOver = false;
    this.enPassantTarget = null;
    this.lastMessage = "white to move";
  }

  setCustomStartingBoard(board) {
    this.customStartingBoard = this.cloneBoard(board);
  }

  createInitialCastlingRights() {
    return {
      white: { kingSide: true, queenSide: true },
      black: { kingSide: true, queenSide: true },
    };
  }

  createInitialBoard() {
    const backRank = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));

    for (let file = 0; file < 8; file += 1) {
      board[0][file] = { type: backRank[file], color: "black", originParity: (0 + file) % 2 };
      board[1][file] = { type: "pawn", color: "black", originParity: (1 + file) % 2 };
      board[6][file] = { type: "pawn", color: "white", originParity: (6 + file) % 2 };
      board[7][file] = { type: backRank[file], color: "white", originParity: (7 + file) % 2 };
    }

    return board;
  }

  getState() {
    return {
      board: this.cloneBoard(this.board),
      lostPieces: {
        white: [...this.lostPieces.white],
        black: [...this.lostPieces.black],
      },
      turn: this.turn,
      winner: this.winner,
      gameOver: this.gameOver,
      castlingRights: {
        white: { ...this.castlingRights.white },
        black: { ...this.castlingRights.black },
      },
      enPassantTarget: this.enPassantTarget ? {
        target: { ...this.enPassantTarget.target },
        pawn: { ...this.enPassantTarget.pawn },
        pawnColor: this.enPassantTarget.pawnColor,
        capturableBy: this.enPassantTarget.capturableBy,
      } : null,
      inCheck: this.isInCheck(this.turn),
      lastMessage: this.lastMessage,
    };
  }

  cloneBoard(board) {
    return board.map((row) => row.map((p) => (p ? { ...p } : null)));
  }

  recordLostPiece(piece) {
    if (!piece || (piece.color !== "white" && piece.color !== "black") || typeof piece.type !== "string") {
      return;
    }
    this.lostPieces[piece.color].push(piece.type);
  }

  removeMostRecentLostPiece(color, type) {
    if ((color !== "white" && color !== "black") || typeof type !== "string") {
      return;
    }

    const list = this.lostPieces[color];
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (list[index] === type) {
        list.splice(index, 1);
        return;
      }
    }
  }

  isInside(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
  }

  getPiece(square) {
    return this.board[square.row][square.col];
  }

  isCaptureAllowed(attacker, target, targetSquare, board = this.board, options = {}) {
    const { allowKingTarget = false } = options;

    if (!target || attacker.color === target.color) {
      return false;
    }

    if (target.type === "king" && !allowKingTarget) {
      return false;
    }

    if (isStageHazardActive(61)) {
      return false;
    }

    if (isStageHazardActive(52) && attacker.type === "knight") {
      return false;
    }

    if (isStageHazardActive(55) && attacker.type === "pawn" && target.type === "pawn") {
      return false;
    }

    if (isStageHazardActive(72) && (targetSquare.row === 1 || targetSquare.row === 6)) {
      return false;
    }

    if (isStageHazardActive(79) && (attacker.type === "queen" || attacker.type === "king")) {
      return false;
    }

    if (isStageHazardActive(93) && target.type === "knight") {
      return false;
    }

    if (target.type === "rook" && hasActiveEffect(target.color, 22) && attacker.type === "pawn") {
      return false;
    }

    if (target.type === "queen" && hasActiveEffect(target.color, 4) && attacker.type === "pawn") {
      return false;
    }

    if (target.type === "queen" && hasActiveEffect(target.color, 10) && attacker.type === "queen") {
      return false;
    }

    if (target.type === "queen" && hasActiveEffect(target.color, 43) && attacker.type === "queen") {
      return false;
    }

    if (target.type === "pawn" && hasActiveEffect(target.color, 13)) {
      return false;
    }

    if (
      target.type === "pawn"
      && attacker.type === "pawn"
      && hasActiveEffect(target.color, 39)
      && this.hasFriendlyPawnOnFile(target.color, targetSquare.col, targetSquare.row, board)
    ) {
      return false;
    }

    if (target.type === "knight" && hasActiveEffect(target.color, 25)) {
      return false;
    }

    if (target.type === "rook" && hasActiveEffect(target.color, 47) && this.hasConnectedRook(target.color, targetSquare, board)) {
      return false;
    }

    if (this.isSquareShielded(targetSquare, target.color)) {
      return false;
    }

    if (
      hasActiveEffect(target.color, 18)
      && (attacker.type === "bishop" || attacker.type === "knight")
      && this.isAdjacentToKing(target.color, targetSquare, board)
    ) {
      return false;
    }

    return true;
  }

  isAdjacentToKing(color, square, board = this.board) {
    const king = this.findKing(color, board);
    if (!king) {
      return false;
    }

    return Math.abs(king.row - square.row) <= 1 && Math.abs(king.col - square.col) <= 1;
  }

  isAdjacentToEnemyKnight(square, enemyColor) {
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const r = square.row + dr;
        const c = square.col + dc;
        if (!this.isInside(r, c)) {
          continue;
        }
        const piece = this.board[r][c];
        if (piece && piece.color === enemyColor && piece.type === "knight") {
          return true;
        }
      }
    }
    return false;
  }

  isAdjacentToEnemyRook(square, enemyColor) {
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const r = square.row + dr;
        const c = square.col + dc;
        if (!this.isInside(r, c)) {
          continue;
        }
        const piece = this.board[r][c];
        if (piece && piece.color === enemyColor && piece.type === "rook") {
          return true;
        }
      }
    }
    return false;
  }

  hasFriendlyPawnOnFile(color, col, excludeRow, board = this.board) {
    for (let row = 0; row < 8; row += 1) {
      if (row === excludeRow) {
        continue;
      }
      const piece = board[row][col];
      if (piece && piece.color === color && piece.type === "pawn") {
        return true;
      }
    }
    return false;
  }

  hasConnectedRook(color, square, board = this.board) {
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        if (row === square.row && col === square.col) {
          continue;
        }
        const piece = board[row][col];
        if (!piece || piece.color !== color || piece.type !== "rook") {
          continue;
        }
        if (row === square.row || col === square.col) {
          return true;
        }
      }
    }
    return false;
  }

  isAdjacentToAnyBishop(square, board = this.board) {
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) {
          continue;
        }
        const r = square.row + dr;
        const c = square.col + dc;
        if (!this.isInside(r, c)) {
          continue;
        }
        const p = board[r][c];
        if (p && p.type === "bishop") {
          return true;
        }
      }
    }
    return false;
  }

  isMoveAllowedByStageHazard(from, to, piece, isCapture, board = this.board) {
    const activeHazard = getActiveStageHazardId();
    if (!activeHazard) {
      return true;
    }

    const dr = to.row - from.row;
    const dc = to.col - from.col;
    const absDr = Math.abs(dr);
    const absDc = Math.abs(dc);
    const isDiagonal = absDr === absDc && absDr > 0;
    const moveDistance = Math.max(absDr, absDc);

    if (isBlockedTileSquare(to.row, to.col)) {
      return false;
    }

    if (activeHazard === 51 && piece.type === "bishop") {
      return false;
    }

    if (activeHazard === 52 && piece.type === "knight" && isCapture) {
      return false;
    }

    if (activeHazard === 53 && piece.type === "rook" && moveDistance > 3) {
      return false;
    }

    if (activeHazard === 54 && piece.type === "queen" && !isCapture) {
      return false;
    }

    if (activeHazard === 55 && piece.type === "pawn" && isCapture) {
      const target = board[to.row][to.col];
      if (target && target.type === "pawn") {
        return false;
      }
    }

    if (activeHazard === 56 && piece.type === "king" && (to.col === 0 || to.col === 7)) {
      return false;
    }

    if (activeHazard === 57 && isDarkSquare(to.row, to.col)) {
      return false;
    }

    if (activeHazard === 58 && isLightSquare(to.row, to.col)) {
      return false;
    }

    if (activeHazard === 59 && isCenterLockSquare(to.row, to.col)) {
      return false;
    }

    if (activeHazard === 60 && (from.col === 0 || from.col === 7)) {
      return false;
    }

    if (activeHazard === 61 && isCapture) {
      return false;
    }

    if (activeHazard === 62 && piece.type !== "knight" && moveDistance > 2) {
      return false;
    }

    if (activeHazard === 63) {
      if ((piece.color === "white" && dr > 0) || (piece.color === "black" && dr < 0)) {
        return false;
      }
    }

    if (activeHazard === 64 && (from.col === 2 || from.col === 5) && to.col !== from.col) {
      return false;
    }

    if (activeHazard === 65 && isDiagonal && piece.type !== "bishop") {
      return false;
    }

    if (activeHazard === 66 && (from.row === 3 || from.row === 4)) {
      return false;
    }

    if (activeHazard === 73 && piece.type === "queen" && moveDistance > 1) {
      return false;
    }

    if (activeHazard === 74 && piece.type === "knight") {
      const isOrthOne = (absDr === 1 && absDc === 0) || (absDr === 0 && absDc === 1);
      if (!isOrthOne) {
        return false;
      }
    }

    if (activeHazard === 70 && isSquareBlockedByCaptureCooldown(piece.color, from.row, from.col)) {
      return false;
    }

    if (activeHazard === 72 && isCapture && (to.row === 1 || to.row === 6)) {
      return false;
    }

    if (activeHazard === 75 && this.isAdjacentToAnyBishop(from, board)) {
      return false;
    }

    if (activeHazard === 85 && stageHazardRuntime.frostbiteType && piece.type === stageHazardRuntime.frostbiteType) {
      return false;
    }

    if (activeHazard === 86 && piece.type === "king" && isMineSquare(to.row, to.col)) {
      return false;
    }

    if (activeHazard === 76 && piece.type === "pawn") {
      const backwardStep = piece.color === "white" ? 1 : -1;
      return absDc === 0 && dr === backwardStep && !isCapture;
    }

    if (activeHazard === 77 && piece.type === "rook") {
      return isDiagonal && moveDistance === 1;
    }

    if (activeHazard === 78 && piece.type === "knight" && !isLightSquare(to.row, to.col)) {
      return false;
    }

    if (activeHazard === 81 && isCapture && piece.type === "pawn" && absDc === 1 && absDr === 1 && board[to.row][to.col] == null) {
      return false;
    }

    if (activeHazard === 87 && piece.type === "pawn") {
      if ((piece.color === "white" && to.row < 3) || (piece.color === "black" && to.row > 4)) {
        return false;
      }
    }

    if (activeHazard === 88 && isOnOrAdjacentToMine(from.row, from.col)) {
      return false;
    }

    if (activeHazard === 90 && piece.type === "queen" && moveDistance === 1) {
      return false;
    }

    if (activeHazard === 91 && piece.originParity != null && ((to.row + to.col) % 2) !== piece.originParity) {
      return false;
    }

    if (activeHazard === 94 && piece.type === "bishop") {
      return isDiagonal && moveDistance === 2;
    }

    if (activeHazard === 95 && piece.type === "rook") {
      return (dr === 0 || dc === 0) && moveDistance === 2;
    }

    if (activeHazard === 98 && piece.type !== "king") {
      const king = this.findKing(piece.color, board);
      if (king && Math.abs(king.row - to.row) <= 1 && Math.abs(king.col - to.col) <= 1) {
        return false;
      }
    }

    return true;
  }

  isBonusMoveConstraintMet(piece, square) {
    if (!this.bonusMove || this.bonusMove.color !== piece.color) {
      return true;
    }

    if (this.bonusMove.requiredType && piece.type !== this.bonusMove.requiredType) {
      return false;
    }

    if (this.bonusMove.exactFrom) {
      return this.bonusMove.exactFrom.row === square.row && this.bonusMove.exactFrom.col === square.col;
    }

    return true;
  }

  isSquareShielded(square, color) {
    const shield = this.safePassageShields[color];
    return !!shield && shield.row === square.row && shield.col === square.col && shield.remainingEnemyMoves > 0;
  }

  applyRoyalMercy(color) {
    const king = this.findKing(color);
    if (!king) {
      return false;
    }

    const enemy = color === "white" ? "black" : "white";
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        if (this.board[row][col]) {
          continue;
        }

        const testBoard = this.cloneBoard(this.board);
        testBoard[row][col] = testBoard[king.row][king.col];
        testBoard[king.row][king.col] = null;

        if (!this.isSquareAttacked({ row, col }, enemy, testBoard)) {
          this.board[row][col] = this.board[king.row][king.col];
          this.board[king.row][king.col] = null;
          return true;
        }
      }
    }

    return false;
  }

  getLegalMoves(square, options = {}) {
    const { skipForcedRule = false } = options;
    const piece = this.getPiece(square);
    if (!piece || piece.color !== this.turn || this.gameOver) {
      return [];
    }

    if (!this.isBonusMoveConstraintMet(piece, square)) {
      return [];
    }

    const pseudo = this.getPseudoLegalMoves(square, piece);
    const legalMoves = pseudo.filter((move) => {
      const testBoard = this.cloneBoard(this.board);
      const moving = testBoard[square.row][square.col];
      testBoard[move.row][move.col] = moving;
      testBoard[square.row][square.col] = null;

      if (move.isEnPassant && move.capture) {
        testBoard[move.capture.row][move.capture.col] = null;
      }

      if (move.isCastling && move.rookFrom && move.rookTo) {
        const rookPiece = testBoard[move.rookFrom.row][move.rookFrom.col];
        testBoard[move.rookTo.row][move.rookTo.col] = rookPiece;
        testBoard[move.rookFrom.row][move.rookFrom.col] = null;
      }

      const promotionRow = moving.color === "white" ? 0 : 7;
      if (moving.type === "pawn" && move.row === promotionRow && !isStageHazardActive(67)) {
        return this.promotionOptions.some((promotionType) => {
          const promotionBoard = this.cloneBoard(testBoard);
          promotionBoard[move.row][move.col] = { type: promotionType, color: moving.color };
          return !this.isInCheck(piece.color, promotionBoard);
        });
      }

      return !this.isInCheck(piece.color, testBoard);
    });

    if (skipForcedRule) {
      return legalMoves;
    }

    const forcedMoves = this.getForcedEnPassantMoves(piece.color);
    if (forcedMoves.length === 0) {
      return legalMoves;
    }

    return legalMoves.filter((move) => {
      if (!move.isEnPassant) {
        return false;
      }

      return forcedMoves.some((forcedMove) => (
        forcedMove.from.row === square.row
        && forcedMove.from.col === square.col
        && forcedMove.to.row === move.row
        && forcedMove.to.col === move.col
      ));
    });
  }

  getPseudoLegalMoves(square, piece) {
    const moves = [];
    const { row, col } = square;
    const activeHazard = getActiveStageHazardId();

    if (activeHazard === 82) {
      const dir = piece.color === "white" ? -1 : 1;
      const oneStep = { row: row + dir, col };
      if (this.isInside(oneStep.row, oneStep.col) && !this.board[oneStep.row][oneStep.col]) {
        moves.push(oneStep);
      }

      [-1, 1].forEach((dc) => {
        const r = row + dir;
        const c = col + dc;
        if (!this.isInside(r, c)) {
          return;
        }
        const target = this.board[r][c];
        if (target && this.isCaptureAllowed(piece, target, { row: r, col: c })) {
          moves.push({ row: r, col: c });
        }
      });

      return uniqueMoves(moves).filter((move) => {
        const target = this.board[move.row][move.col];
        const isCapture = !!target;
        return this.isMoveAllowedByStageHazard(square, { row: move.row, col: move.col }, piece, isCapture);
      });
    }

    if (activeHazard === 51 && piece.type === "bishop") {
      return [];
    }

    if (activeHazard === 60 && (col === 0 || col === 7)) {
      return [];
    }

    if (activeHazard === 66 && (row === 3 || row === 4)) {
      return [];
    }

    if (activeHazard === 70 && isSquareBlockedByCaptureCooldown(piece.color, row, col)) {
      return [];
    }

    if (activeHazard === 75 && this.isAdjacentToAnyBishop(square)) {
      return [];
    }

    const pushRay = (dr, dc, options = {}) => {
      const { allowPassCount = 0 } = options;
      let r = row + dr;
      let c = col + dc;
      let passCount = 0;

      while (this.isInside(r, c)) {
        if (isBlockedTileSquare(r, c)) {
          break;
        }

        const target = this.board[r][c];
        if (!target) {
          moves.push({ row: r, col: c });
        } else {
          if (target.color !== piece.color && this.isCaptureAllowed(piece, target, { row: r, col: c })) {
            moves.push({ row: r, col: c });
          }

          if (allowPassCount > passCount) {
            passCount += 1;
            r += dr;
            c += dc;
            continue;
          }

          break;
        }
        r += dr;
        c += dc;
      }
    };

    if (piece.type === "pawn") {
      if (activeHazard === 76) {
        const backwardStep = piece.color === "white" ? 1 : -1;
        const backward = { row: row + backwardStep, col };
        if (this.isInside(backward.row, backward.col) && !this.board[backward.row][backward.col]) {
          moves.push(backward);
        }

        return uniqueMoves(moves).filter((move) => {
          const target = this.board[move.row][move.col];
          const isCapture = !!target;
          return this.isMoveAllowedByStageHazard(square, { row: move.row, col: move.col }, piece, isCapture);
        });
      }

      const dir = piece.color === "white" ? -1 : 1;
      const startRow = piece.color === "white" ? 6 : 1;
      const oneStep = { row: row + dir, col };
      const pawnSprint = hasActiveEffect(piece.color, 5);
      const ghostPawn = hasActiveEffect(piece.color, 8);
      const pawnStorm = hasActiveEffect(piece.color, 45);
      const pawnRecall = hasActiveEffect(piece.color, 26);

      if (this.isInside(oneStep.row, oneStep.col) && !this.board[oneStep.row][oneStep.col]) {
        moves.push(oneStep);

        const twoStep = { row: row + dir * 2, col };
        if (
          this.isInside(twoStep.row, twoStep.col)
          && (row === startRow || pawnSprint)
          && !this.board[twoStep.row][twoStep.col]
        ) {
          moves.push(twoStep);
        }
      }

      if (
        ghostPawn
        && this.isInside(row + dir * 2, col)
        && this.board[row + dir][col]
        && !this.board[row + dir * 2][col]
      ) {
        moves.push({ row: row + dir * 2, col });
      }

      if (pawnStorm) {
        const twoAhead = { row: row + dir * 2, col };
        if (
          this.isInside(twoAhead.row, twoAhead.col)
          && !this.board[row + dir][col]
          && !this.board[twoAhead.row][twoAhead.col]
        ) {
          moves.push(twoAhead);
        }

        const threeAhead = { row: row + dir * 3, col };
        if (
          row === startRow
          && this.isInside(threeAhead.row, threeAhead.col)
          && !this.board[row + dir][col]
          && !this.board[row + dir * 2][col]
          && !this.board[threeAhead.row][threeAhead.col]
        ) {
          moves.push(threeAhead);
        }
      }

      if (pawnRecall) {
        const backward = { row: row - dir, col };
        if (this.isInside(backward.row, backward.col) && !this.board[backward.row][backward.col]) {
          moves.push(backward);
        }
      }

      [-1, 1].forEach((dc) => {
        const r = row + dir;
        const c = col + dc;
        if (!this.isInside(r, c)) {
          return;
        }
        const target = this.board[r][c];
        if (target && this.isCaptureAllowed(piece, target, { row: r, col: c })) {
          moves.push({ row: r, col: c });
        } else if (!target && hasActiveEffect(piece.color, 21)) {
          moves.push({ row: r, col: c });
        }
      });

      if (!isStageHazardActive(81) && this.enPassantTarget && this.enPassantTarget.capturableBy === piece.color) {
        const enPassantLanding = this.enPassantTarget.target;
        const vulnerablePawnSquare = this.enPassantTarget.pawn;
        const adjacentPawn = this.board[vulnerablePawnSquare.row][vulnerablePawnSquare.col];

        if (
          enPassantLanding.row === row + dir
          && Math.abs(enPassantLanding.col - col) === 1
          && vulnerablePawnSquare.row === row
          && this.board[enPassantLanding.row][enPassantLanding.col] === null
          && adjacentPawn
          && adjacentPawn.type === "pawn"
          && adjacentPawn.color !== piece.color
        ) {
          moves.push({
            row: enPassantLanding.row,
            col: enPassantLanding.col,
            isEnPassant: true,
            capture: { row: vulnerablePawnSquare.row, col: vulnerablePawnSquare.col },
          });
        }
      }

      if (hasActiveEffect(piece.color, 32)) {
        const forwardCapture = { row: row + dir, col };
        if (this.isInside(forwardCapture.row, forwardCapture.col)) {
          const target = this.board[forwardCapture.row][forwardCapture.col];
          if (target && this.isCaptureAllowed(piece, target, forwardCapture)) {
            moves.push(forwardCapture);
          }
        }
      }
    }

    if (piece.type === "knight") {
      if (activeHazard === 74) {
        [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => {
          const r = row + dr;
          const c = col + dc;
          if (!this.isInside(r, c)) {
            return;
          }
          const target = this.board[r][c];
          if (!target || this.isCaptureAllowed(piece, target, { row: r, col: c })) {
            moves.push({ row: r, col: c, isHeavyHorseshoes: true });
          }
        });

        return uniqueMoves(moves).filter((move) => {
          const target = this.board[move.row][move.col];
          const isCapture = !!target;
          return this.isMoveAllowedByStageHazard(square, { row: move.row, col: move.col }, piece, isCapture);
        });
      }

      const jumps = [
        [-2, -1], [-2, 1],
        [-1, -2], [-1, 2],
        [1, -2], [1, 2],
        [2, -1], [2, 1],
      ];

      if (hasActiveEffect(piece.color, 2)) {
        jumps.push(
          [-3, -1], [-3, 1],
          [-1, -3], [-1, 3],
          [1, -3], [1, 3],
          [3, -1], [3, 1],
        );
      }

      jumps.forEach(([dr, dc]) => {
        const r = row + dr;
        const c = col + dc;
        if (!this.isInside(r, c)) {
          return;
        }
        const target = this.board[r][c];
        if (!target || this.isCaptureAllowed(piece, target, { row: r, col: c })) {
          moves.push({ row: r, col: c });
        }
      });

      if (hasActiveEffect(piece.color, 11)) {
        for (let r = 0; r < 8; r += 1) {
          for (let c = 0; c < 8; c += 1) {
            if ((r + c) % 2 === (row + col) % 2) {
              continue;
            }
            if (!this.board[r][c]) {
              moves.push({ row: r, col: c });
            }
          }
        }
      }

      if (hasActiveEffect(piece.color, 44)) {
        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            if (dr === 0 && dc === 0) {
              continue;
            }
            const r = row + dr;
            const c = col + dc;
            if (!this.isInside(r, c)) {
              continue;
            }
            const target = this.board[r][c];
            if (!target || this.isCaptureAllowed(piece, target, { row: r, col: c })) {
              moves.push({ row: r, col: c, isKnightPivot: true });
            }
          }
        }
      }

      if (hasActiveEffect(piece.color, 38)) {
        [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([dr, dc]) => {
          const r = row + dr;
          const c = col + dc;
          if (!this.isInside(r, c)) {
            return;
          }
          const target = this.board[r][c];
          if (!target || this.isCaptureAllowed(piece, target, { row: r, col: c })) {
            moves.push({ row: r, col: c, isKnightLadder: true });
          }
        });
      }
    }

    if (piece.type === "bishop" || piece.type === "queen") {
      const bishopPassCount = piece.type === "bishop"
        ? (hasActiveEffect(piece.color, 29) ? 2 : (hasActiveEffect(piece.color, 15) ? 1 : 0))
        : 0;
      pushRay(-1, -1, { allowPassCount: bishopPassCount });
      pushRay(-1, 1, { allowPassCount: bishopPassCount });
      pushRay(1, -1, { allowPassCount: bishopPassCount });
      pushRay(1, 1, { allowPassCount: bishopPassCount });

      if (piece.type === "bishop" && hasActiveEffect(piece.color, 3)) {
        [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => {
          const r = row + dr;
          const c = col + dc;
          if (!this.isInside(r, c)) {
            return;
          }
          const target = this.board[r][c];
          if (!target || this.isCaptureAllowed(piece, target, { row: r, col: c })) {
            moves.push({ row: r, col: c });
          }
        });
      }

      if (piece.type === "bishop" && hasActiveEffect(piece.color, 48)) {
        [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => {
          const r = row + dr;
          const c = col + dc;
          if (!this.isInside(r, c)) {
            return;
          }
          const target = this.board[r][c];
          if (!target || this.isCaptureAllowed(piece, target, { row: r, col: c })) {
            moves.push({ row: r, col: c, isBishopPrism: true });
          }
        });
      }

      if (piece.type === "bishop" && hasActiveEffect(piece.color, 9)) {
        [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => {
          const r = row + dr;
          const c = col + dc;
          if (!this.isInside(r, c)) {
            return;
          }
          const target = this.board[r][c];
          if (target && this.isCaptureAllowed(piece, target, { row: r, col: c })) {
            moves.push({ row: r, col: c });
          }
        });
      }

      if (piece.type === "bishop" && hasActiveEffect(piece.color, 23)) {
        [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([dr, dc]) => {
          let r = row + dr;
          let c = col + dc;
          let jumpedEnemy = false;

          while (this.isInside(r, c)) {
            const target = this.board[r][c];
            if (!target) {
              r += dr;
              c += dc;
              continue;
            }

            if (!jumpedEnemy) {
              if (target.color !== piece.color) {
                jumpedEnemy = true;
                r += dr;
                c += dc;
                continue;
              }
              break;
            }

            if (target.color !== piece.color && this.isCaptureAllowed(piece, target, { row: r, col: c })) {
              moves.push({ row: r, col: c });
            }
            break;
          }
        });
      }

      if (piece.type === "bishop" && hasActiveEffect(piece.color, 36)) {
        pushRay(-1, 0, { allowPassCount: 0 });
        pushRay(1, 0, { allowPassCount: 0 });
        pushRay(0, -1, { allowPassCount: 0 });
        pushRay(0, 1, { allowPassCount: 0 });
      }

      if (piece.type === "bishop" && activeHazard === 97) {
        pushRay(-1, 0, { allowPassCount: 0 });
        pushRay(1, 0, { allowPassCount: 0 });
        pushRay(0, -1, { allowPassCount: 0 });
        pushRay(0, 1, { allowPassCount: 0 });
      }
    }

    if (piece.type === "rook" || piece.type === "queen") {
      if (piece.type === "rook" && activeHazard === 77) {
        [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([dr, dc]) => {
          const r = row + dr;
          const c = col + dc;
          if (!this.isInside(r, c) || isBlockedTileSquare(r, c)) {
            return;
          }
          const target = this.board[r][c];
          if (!target || this.isCaptureAllowed(piece, target, { row: r, col: c })) {
            moves.push({ row: r, col: c, isTiltedTower: true });
          }
        });

        return uniqueMoves(moves).filter((move) => {
          const target = this.board[move.row][move.col];
          const isCapture = !!target;
          return this.isMoveAllowedByStageHazard(square, { row: move.row, col: move.col }, piece, isCapture);
        });
      }

      const rookRocket = piece.type === "rook" && hasActiveEffect(piece.color, 1);
      const queenLeap = piece.type === "queen" && hasActiveEffect(piece.color, 24);
      const passCount = (rookRocket || queenLeap) ? 1 : 0;
      pushRay(-1, 0, { allowPassCount: passCount });
      pushRay(1, 0, { allowPassCount: passCount });
      pushRay(0, -1, { allowPassCount: passCount });
      pushRay(0, 1, { allowPassCount: passCount });

      if (piece.type === "rook" && (hasActiveEffect(piece.color, 6) || hasActiveEffect(piece.color, 28))) {
        [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([dr, dc]) => {
          const r = row + dr;
          const c = col + dc;
          if (!this.isInside(r, c)) {
            return;
          }
          const target = this.board[r][c];
          if (!target || this.isCaptureAllowed(piece, target, { row: r, col: c })) {
            moves.push({ row: r, col: c });
          }
        });
      }

      if (piece.type === "rook" && hasActiveEffect(piece.color, 14)) {
        [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([dr, dc]) => {
          const r = row + dr;
          const c = col + dc;
          if (!this.isInside(r, c)) {
            return;
          }
          const target = this.board[r][c];
          if (target && this.isCaptureAllowed(piece, target, { row: r, col: c })) {
            moves.push({ row: r, col: c });
          }
        });
      }

      if (piece.type === "rook" && activeHazard === 96) {
        pushRay(-1, -1, { allowPassCount: 0 });
        pushRay(-1, 1, { allowPassCount: 0 });
        pushRay(1, -1, { allowPassCount: 0 });
        pushRay(1, 1, { allowPassCount: 0 });
      }
    }

    if (piece.type === "queen" && hasActiveEffect(piece.color, 16)) {
      [
        [-2, -1], [-2, 1],
        [-1, -2], [-1, 2],
        [1, -2], [1, 2],
        [2, -1], [2, 1],
      ].forEach(([dr, dc]) => {
        const r = row + dr;
        const c = col + dc;
        if (!this.isInside(r, c)) {
          return;
        }
        const target = this.board[r][c];
        if (!target || this.isCaptureAllowed(piece, target, { row: r, col: c })) {
          moves.push({ row: r, col: c });
        }
      });
    }

    if (piece.type === "queen" && activeHazard === 73) {
      const queenLikeKingMoves = [];
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr === 0 && dc === 0) {
            continue;
          }
          const r = row + dr;
          const c = col + dc;
          if (!this.isInside(r, c)) {
            continue;
          }
          const target = this.board[r][c];
          if (!target || this.isCaptureAllowed(piece, target, { row: r, col: c })) {
            queenLikeKingMoves.push({ row: r, col: c, isQueensEquality: true });
          }
        }
      }

      return uniqueMoves(queenLikeKingMoves).filter((move) => {
        const target = this.board[move.row][move.col];
        const isCapture = !!target;
        return this.isMoveAllowedByStageHazard(square, { row: move.row, col: move.col }, piece, isCapture);
      });
    }

    if (piece.type === "queen" && hasActiveEffect(piece.color, 30)) {
      const existingQueenMoves = [...moves];
      existingQueenMoves.forEach((baseMove) => {
        [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => {
          const r = baseMove.row + dr;
          const c = baseMove.col + dc;
          if (!this.isInside(r, c)) {
            return;
          }
          const target = this.board[r][c];
          if (!target || this.isCaptureAllowed(piece, target, { row: r, col: c })) {
            moves.push({ row: r, col: c, isQueenSplit: true });
          }
        });
      });
    }

    if (piece.type === "king") {
      const enemy = piece.color === "white" ? "black" : "white";
      const knightNet = hasActiveEffect(enemy, 17);
      const rookBarricade = hasActiveEffect(enemy, 35);

      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr === 0 && dc === 0) {
            continue;
          }
          const r = row + dr;
          const c = col + dc;
          if (!this.isInside(r, c)) {
            continue;
          }
          if (knightNet && this.isAdjacentToEnemyKnight({ row: r, col: c }, enemy)) {
            continue;
          }
          if (rookBarricade && this.isAdjacentToEnemyRook({ row: r, col: c }, enemy)) {
            continue;
          }
          const target = this.board[r][c];
          if (!target || this.isCaptureAllowed(piece, target, { row: r, col: c })) {
            moves.push({ row: r, col: c });
          } else if (hasActiveEffect(piece.color, 40) && target.color === piece.color) {
            moves.push({ row: r, col: c, isKingSwap: true });
          }
        }
      }

      if (hasActiveEffect(piece.color, 7)) {
        [[-2, 0], [2, 0], [0, -2], [0, 2]].forEach(([dr, dc]) => {
          const r = row + dr;
          const c = col + dc;
          if (!this.isInside(r, c)) {
            return;
          }
          if (knightNet && this.isAdjacentToEnemyKnight({ row: r, col: c }, enemy)) {
            return;
          }
          if (rookBarricade && this.isAdjacentToEnemyRook({ row: r, col: c }, enemy)) {
            return;
          }
          const target = this.board[r][c];
          if (!target || this.isCaptureAllowed(piece, target, { row: r, col: c })) {
            moves.push({ row: r, col: c, isRoyalGlide: true });
          }
        });
      }

      if (hasActiveEffect(piece.color, 27)) {
        pushRay(-1, -1, { allowPassCount: 0 });
        pushRay(-1, 1, { allowPassCount: 0 });
        pushRay(1, -1, { allowPassCount: 0 });
        pushRay(1, 1, { allowPassCount: 0 });
      }

      if (activeHazard === 71) {
        pushRay(-1, 0, { allowPassCount: 0 });
        pushRay(1, 0, { allowPassCount: 0 });
        pushRay(0, -1, { allowPassCount: 0 });
        pushRay(0, 1, { allowPassCount: 0 });
        pushRay(-1, -1, { allowPassCount: 0 });
        pushRay(-1, 1, { allowPassCount: 0 });
        pushRay(1, -1, { allowPassCount: 0 });
        pushRay(1, 1, { allowPassCount: 0 });
      }

      if (activeHazard === 84) {
        const kingKnightOffsets = [
          [-2, -1], [-2, 1],
          [-1, -2], [-1, 2],
          [1, -2], [1, 2],
          [2, -1], [2, 1],
        ];

        kingKnightOffsets.forEach(([dr, dc]) => {
          const r = row + dr;
          const c = col + dc;
          if (!this.isInside(r, c) || isBlockedTileSquare(r, c)) {
            return;
          }
          const target = this.board[r][c];
          if (!target || this.isCaptureAllowed(piece, target, { row: r, col: c })) {
            moves.push({ row: r, col: c, isHorseRiding: true });
          }
        });
      }

      moves.push(...this.getCastlingMoves(piece.color, row, col));
    }

    if (hasActiveEffect(piece.color, 20)) {
      const homeRow = piece.color === "white" ? 7 : 0;
      if (row === homeRow) {
        const forward = piece.color === "white" ? row - 1 : row + 1;
        if (this.isInside(forward, col) && !this.board[forward][col]) {
          moves.push({ row: forward, col, isBacklineBoost: true });
        }
      }
    }

    return uniqueMoves(moves).filter((move) => {
      const isEnPassantCapture = !!move.isEnPassant;
      const target = this.board[move.row][move.col];
      const isCapture = isEnPassantCapture || !!target;
      return this.isMoveAllowedByStageHazard(square, { row: move.row, col: move.col }, piece, isCapture);
    });
  }

  getCastlingMoves(color, row, col) {
    const moves = [];
    if (isStageHazardActive(68) || isStageHazardActive(82)) {
      return moves;
    }

    const homeRow = color === "white" ? 7 : 0;
    const enemy = color === "white" ? "black" : "white";

    if (row !== homeRow || col !== 4) {
      return moves;
    }

    if (this.isInCheck(color)) {
      return moves;
    }

    const rights = this.castlingRights[color];
    if (!rights) {
      return moves;
    }

    const luckyCastle = hasActiveEffect(color, 12) && row === homeRow && col === 4;

    if (rights.kingSide || luckyCastle) {
      const rook = this.board[homeRow][7];
      const pathClear = !this.board[homeRow][5] && !this.board[homeRow][6];
      const safePath = !this.isSquareAttacked({ row: homeRow, col: 5 }, enemy)
        && !this.isSquareAttacked({ row: homeRow, col: 6 }, enemy);

      if (rook && rook.type === "rook" && rook.color === color && pathClear && safePath) {
        moves.push({
          row: homeRow,
          col: 6,
          isCastling: true,
          rookFrom: { row: homeRow, col: 7 },
          rookTo: { row: homeRow, col: 5 },
        });
      }
    }

    if (rights.queenSide || luckyCastle) {
      const rook = this.board[homeRow][0];
      const pathClear = !this.board[homeRow][1] && !this.board[homeRow][2] && !this.board[homeRow][3];
      const safePath = !this.isSquareAttacked({ row: homeRow, col: 3 }, enemy)
        && !this.isSquareAttacked({ row: homeRow, col: 2 }, enemy);

      if (rook && rook.type === "rook" && rook.color === color && pathClear && safePath) {
        moves.push({
          row: homeRow,
          col: 2,
          isCastling: true,
          rookFrom: { row: homeRow, col: 0 },
          rookTo: { row: homeRow, col: 3 },
        });
      }
    }

    return moves;
  }

  updateCastlingRightsOnMove(from, to, piece, capturedPiece) {
    const disableRookRightBySquare = (square, color) => {
      const homeRow = color === "white" ? 7 : 0;
      if (square.row !== homeRow) {
        return;
      }
      if (square.col === 0) {
        this.castlingRights[color].queenSide = false;
      }
      if (square.col === 7) {
        this.castlingRights[color].kingSide = false;
      }
    };

    if (piece.type === "king") {
      this.castlingRights[piece.color].kingSide = false;
      this.castlingRights[piece.color].queenSide = false;
    }

    if (piece.type === "rook") {
      disableRookRightBySquare(from, piece.color);
    }

    if (capturedPiece && capturedPiece.type === "rook") {
      disableRookRightBySquare(to, capturedPiece.color);
    }
  }

  findKing(color, board = this.board) {
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = board[row][col];
        if (piece && piece.type === "king" && piece.color === color) {
          return { row, col };
        }
      }
    }
    return null;
  }

  isSquareAttacked(square, byColor, board = this.board) {
    const isInside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
    const targetPiece = board[square.row][square.col] || { type: "king", color: byColor === "white" ? "black" : "white" };
    const activeHazard = getActiveStageHazardId();

    const canAttack = (attacker, fromSquare) => (
      this.isCaptureAllowed(attacker, targetPiece, square, board, { allowKingTarget: true })
      && this.isMoveAllowedByStageHazard(fromSquare, square, attacker, true, board)
    );

    if (activeHazard === 61) {
      return false;
    }

    if (activeHazard === 82) {
      const forward = byColor === "white" ? -1 : 1;
      const fromRow = square.row - forward;
      for (const dc of [-1, 1]) {
        const fromCol = square.col - dc;
        if (!isInside(fromRow, fromCol)) {
          continue;
        }
        const p = board[fromRow][fromCol];
        if (!p || p.color !== byColor) {
          continue;
        }
        if (canAttack(p, { row: fromRow, col: fromCol })) {
          return true;
        }
      }
      return false;
    }

    const pawnDir = byColor === "white" ? -1 : 1;
    const pawnRows = square.row - pawnDir;
    for (const dc of [-1, 1]) {
      const c = square.col + dc;
      if (!isInside(pawnRows, c)) {
        continue;
      }
      const p = board[pawnRows][c];
      if (p && p.color === byColor && p.type === "pawn" && canAttack(p, { row: pawnRows, col: c })) {
        return true;
      }
    }

    if (hasActiveEffect(byColor, 32)) {
      const forwardOrigin = square.row - pawnDir;
      if (isInside(forwardOrigin, square.col)) {
        const p = board[forwardOrigin][square.col];
        if (p && p.color === byColor && p.type === "pawn" && canAttack(p, { row: forwardOrigin, col: square.col })) {
          return true;
        }
      }
    }

    const knightOffsets = activeHazard === 74
      ? [[-1, 0], [1, 0], [0, -1], [0, 1]]
      : [
        [-2, -1], [-2, 1],
        [-1, -2], [-1, 2],
        [1, -2], [1, 2],
        [2, -1], [2, 1],
      ];
    if (activeHazard !== 74 && hasActiveEffect(byColor, 2)) {
      knightOffsets.push(
        [-3, -1], [-3, 1],
        [-1, -3], [-1, 3],
        [1, -3], [1, 3],
        [3, -1], [3, 1],
      );
    }
    for (const [dr, dc] of knightOffsets) {
      const r = square.row + dr;
      const c = square.col + dc;
      if (!isInside(r, c)) {
        continue;
      }
      const p = board[r][c];
      if (p && p.color === byColor && p.type === "knight" && canAttack(p, { row: r, col: c })) {
        return true;
      }
    }

    if (activeHazard !== 74 && hasActiveEffect(byColor, 38)) {
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const r = square.row + dr;
        const c = square.col + dc;
        if (!isInside(r, c)) {
          continue;
        }
        const p = board[r][c];
        if (p && p.color === byColor && p.type === "knight" && canAttack(p, { row: r, col: c })) {
          return true;
        }
      }
    }

    if (activeHazard !== 74 && hasActiveEffect(byColor, 44)) {
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr === 0 && dc === 0) {
            continue;
          }
          const r = square.row + dr;
          const c = square.col + dc;
          if (!isInside(r, c)) {
            continue;
          }
          const p = board[r][c];
          if (p && p.color === byColor && p.type === "knight" && canAttack(p, { row: r, col: c })) {
            return true;
          }
        }
      }
    }

    if (hasActiveEffect(byColor, 17)) {
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          const r = square.row + dr;
          const c = square.col + dc;
          if (!isInside(r, c)) {
            continue;
          }
          const p = board[r][c];
          if (p && p.color === byColor && p.type === "knight" && canAttack(p, { row: r, col: c })) {
            return true;
          }
        }
      }
    }

    const rayThreat = (dirs, evaluatePiece) => {
      for (const [dr, dc] of dirs) {
        let r = square.row + dr;
        let c = square.col + dc;
        const encountered = [];

        while (isInside(r, c) && encountered.length < 2) {
          if (isBlockedTileSquare(r, c)) {
            break;
          }

          const p = board[r][c];
          if (p) {
            encountered.push({ piece: p, row: r, col: c });
            if (p.color === byColor && evaluatePiece(encountered)) {
              return true;
            }
          }
          r += dr;
          c += dc;
        }
      }
      return false;
    };

    if (rayThreat([[-1, 0], [1, 0], [0, -1], [0, 1]], (encountered) => {
      const current = encountered[encountered.length - 1].piece;
      const currentSquare = encountered[encountered.length - 1];
      if (!canAttack(current, { row: currentSquare.row, col: currentSquare.col })) {
        return false;
      }

      if (current.type === "rook") {
        return encountered.length === 1 || hasActiveEffect(byColor, 1);
      }
      if (current.type === "bishop" && activeHazard === 97) {
        return encountered.length === 1;
      }
      if (current.type === "bishop" && hasActiveEffect(byColor, 36)) {
        return encountered.length === 1;
      }
      if (current.type === "queen") {
        if (activeHazard === 73) {
          const distance = Math.max(
            Math.abs(currentSquare.row - square.row),
            Math.abs(currentSquare.col - square.col),
          );
          return distance === 1;
        }
        return encountered.length === 1 || hasActiveEffect(byColor, 24);
      }
      return false;
    })) {
      return true;
    }

    if (rayThreat([[-1, -1], [-1, 1], [1, -1], [1, 1]], (encountered) => {
      const current = encountered[encountered.length - 1].piece;
      const currentSquare = encountered[encountered.length - 1];
      if (!canAttack(current, { row: currentSquare.row, col: currentSquare.col })) {
        return false;
      }

      if (current.type === "queen") {
        if (activeHazard === 73) {
          const distance = Math.max(
            Math.abs(currentSquare.row - square.row),
            Math.abs(currentSquare.col - square.col),
          );
          return distance === 1;
        }
        return encountered.length === 1;
      }

      if (current.type === "bishop") {
        if (encountered.length === 1) {
          return true;
        }
        if (encountered.length === 2 && hasActiveEffect(byColor, 15)) {
          return true;
        }
        if (
          encountered.length === 2
          && hasActiveEffect(byColor, 23)
          && encountered[0].piece.color !== byColor
        ) {
          return true;
        }
      }

      if (current.type === "rook" && activeHazard === 96) {
        return encountered.length === 1;
      }
      return false;
    })) {
      return true;
    }

    const oneStepOrth = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of oneStepOrth) {
      const r = square.row + dr;
      const c = square.col + dc;
      if (!isInside(r, c)) {
        continue;
      }
      const p = board[r][c];
      if (!p || p.color !== byColor || !canAttack(p, { row: r, col: c })) {
        continue;
      }
      if (p.type === "king") {
        return true;
      }
      if (p.type === "bishop" && (hasActiveEffect(byColor, 3) || hasActiveEffect(byColor, 9) || hasActiveEffect(byColor, 48))) {
        return true;
      }
    }

    const kingRange = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of kingRange) {
      const r = square.row + dr;
      const c = square.col + dc;
      if (!isInside(r, c)) {
        continue;
      }
      const p = board[r][c];
      if (p && p.color === byColor && p.type === "king" && canAttack(p, { row: r, col: c })) {
        return true;
      }
    }

    if (activeHazard !== 71 && hasActiveEffect(byColor, 7)) {
      for (const [dr, dc] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
        const r = square.row + dr;
        const c = square.col + dc;
        if (!isInside(r, c)) {
          continue;
        }
        const p = board[r][c];
        if (p && p.color === byColor && p.type === "king" && canAttack(p, { row: r, col: c })) {
          return true;
        }
      }
    }

    if (hasActiveEffect(byColor, 27)) {
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        let r = square.row + dr;
        let c = square.col + dc;
        while (isInside(r, c)) {
          const p = board[r][c];
          if (!p) {
            r += dr;
            c += dc;
            continue;
          }
          if (p.color === byColor && p.type === "king" && canAttack(p, { row: r, col: c })) {
            return true;
          }
          break;
        }
      }
    }

    if (activeHazard === 71) {
      if (rayThreat([[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]], (encountered) => {
        const current = encountered[encountered.length - 1].piece;
        const currentSquare = encountered[encountered.length - 1];
        if (current.type !== "king") {
          return false;
        }
        return canAttack(current, { row: currentSquare.row, col: currentSquare.col });
      })) {
        return true;
      }
    }

    if (activeHazard === 84) {
      const kingKnightOffsets = [
        [-2, -1], [-2, 1],
        [-1, -2], [-1, 2],
        [1, -2], [1, 2],
        [2, -1], [2, 1],
      ];
      for (const [dr, dc] of kingKnightOffsets) {
        const r = square.row + dr;
        const c = square.col + dc;
        if (!isInside(r, c)) {
          continue;
        }
        const p = board[r][c];
        if (p && p.color === byColor && p.type === "king" && canAttack(p, { row: r, col: c })) {
          return true;
        }
      }
    }

    if (hasActiveEffect(byColor, 6) || hasActiveEffect(byColor, 14) || hasActiveEffect(byColor, 28)) {
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const r = square.row + dr;
        const c = square.col + dc;
        if (!isInside(r, c)) {
          continue;
        }
        const p = board[r][c];
        if (p && p.color === byColor && p.type === "rook" && canAttack(p, { row: r, col: c })) {
          return true;
        }
      }
    }

    if (hasActiveEffect(byColor, 35)) {
      for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
        const r = square.row + dr;
        const c = square.col + dc;
        if (!isInside(r, c)) {
          continue;
        }
        const p = board[r][c];
        if (p && p.color === byColor && p.type === "rook" && canAttack(p, { row: r, col: c })) {
          return true;
        }
      }
    }

    if (hasActiveEffect(byColor, 16)) {
      for (const [dr, dc] of [
        [-2, -1], [-2, 1],
        [-1, -2], [-1, 2],
        [1, -2], [1, 2],
        [2, -1], [2, 1],
      ]) {
        const r = square.row + dr;
        const c = square.col + dc;
        if (!isInside(r, c)) {
          continue;
        }
        const p = board[r][c];
        if (p && p.color === byColor && p.type === "queen" && canAttack(p, { row: r, col: c })) {
          return true;
        }
      }
    }

    return false;
  }

  isInCheck(color, board = this.board) {
    const kingSquare = this.findKing(color, board);
    if (!kingSquare) {
      return false;
    }
    const enemy = color === "white" ? "black" : "white";
    return this.isSquareAttacked({ ...kingSquare }, enemy, board);
  }

  hasAnyLegalMove(color) {
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = this.board[row][col];
        if (piece && piece.color === color) {
          const savedTurn = this.turn;
          this.turn = color;
          const legal = this.getLegalMoves({ row, col });
          this.turn = savedTurn;
          if (legal.length > 0) {
            return true;
          }
        }
      }
    }
    return false;
  }

  getForcedEnPassantMoves(color = this.turn) {
    if (isStageHazardActive(81)) {
      return [];
    }

    const forcedMoves = [];
    const savedTurn = this.turn;
    this.turn = color;

    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = this.board[row][col];
        if (!piece || piece.color !== color || piece.type !== "pawn") {
          continue;
        }

        const legalMoves = this.getLegalMoves({ row, col }, { skipForcedRule: true });
        legalMoves.forEach((move) => {
          if (move.isEnPassant) {
            forcedMoves.push({
              from: { row, col },
              to: { row: move.row, col: move.col },
            });
          }
        });
      }
    }

    this.turn = savedTurn;
    return forcedMoves;
  }

  move(from, to, promotionType = "queen") {
    if (this.gameOver) {
      return { ok: false, reason: "Game is over." };
    }

    const piece = this.getPiece(from);
    if (!piece) {
      return { ok: false, reason: "No piece on source square." };
    }

    if (piece.color !== this.turn) {
      return { ok: false, reason: `It is ${this.turn}'s turn.` };
    }

    if (!this.isBonusMoveConstraintMet(piece, from)) {
      return { ok: false, reason: "This bonus move must use a different piece." };
    }

    const legalMoves = this.getLegalMoves(from);
    const selectedMove = legalMoves.find((m) => m.row === to.row && m.col === to.col);
    if (!selectedMove) {
      return { ok: false, reason: "Illegal move." };
    }

    const forcedMoves = this.getForcedEnPassantMoves(this.turn);
    if (forcedMoves.length > 0 && !selectedMove.isEnPassant) {
      return { ok: false, reason: "En passant is forced this turn." };
    }

    const movingColor = piece.color;
    const opponentColor = movingColor === "white" ? "black" : "white";
    const wasBonusMove = !!this.bonusMove;
    const capturedPiece = this.board[to.row][to.col];
    const isFriendlyKingSwap = selectedMove.isKingSwap && capturedPiece && capturedPiece.color === movingColor;
    let didCapture = !!capturedPiece && !isFriendlyKingSwap;
    let capturedTypeForPawnEmpowerment = capturedPiece ? capturedPiece.type : null;
    let currentSquareAfterMove = { row: to.row, col: to.col };

    if (capturedPiece && !isFriendlyKingSwap) {
      this.recordLostPiece(capturedPiece);
    }

    if (selectedMove.isKingSwap && capturedPiece && capturedPiece.color === movingColor) {
      this.board[to.row][to.col] = piece;
      this.board[from.row][from.col] = capturedPiece;
    } else {
      this.board[to.row][to.col] = piece;
      this.board[from.row][from.col] = null;
    }

    if (selectedMove.isEnPassant && selectedMove.capture) {
      const epPiece = this.board[selectedMove.capture.row][selectedMove.capture.col];
      if (epPiece) {
        capturedTypeForPawnEmpowerment = epPiece.type;
        this.recordLostPiece(epPiece);
      }
      this.board[selectedMove.capture.row][selectedMove.capture.col] = null;
      didCapture = true;
    }

    if (selectedMove.isCastling && selectedMove.rookFrom && selectedMove.rookTo) {
      const rookPiece = this.board[selectedMove.rookFrom.row][selectedMove.rookFrom.col];
      this.board[selectedMove.rookTo.row][selectedMove.rookTo.col] = rookPiece;
      this.board[selectedMove.rookFrom.row][selectedMove.rookFrom.col] = null;
    }

    if (
      piece.type === "bishop"
      && hasActiveEffect(movingColor, 42)
      && !(from.row === to.row && from.col === to.col)
    ) {
      const dr = Math.sign(to.row - from.row);
      const dc = Math.sign(to.col - from.col);
      if (dr !== 0 || dc !== 0) {
        outerBishopEcho:
        for (let r = 0; r < 8; r += 1) {
          for (let c = 0; c < 8; c += 1) {
            if (r === to.row && c === to.col) {
              continue;
            }
            const other = this.board[r][c];
            if (!other || other.color !== movingColor || other.type !== "bishop") {
              continue;
            }

            const nr = r + dr;
            const nc = c + dc;
            if (!this.isInside(nr, nc)) {
              continue;
            }

            const target = this.board[nr][nc];
            if (!target || this.isCaptureAllowed(other, target, { row: nr, col: nc })) {
              this.board[nr][nc] = other;
              this.board[r][c] = null;
              break outerBishopEcho;
            }
          }
        }
      }
    }

    this.updateCastlingRightsOnMove(from, to, piece, capturedPiece);

    if (isStageHazardActive(83) && piece.type === "rook" && didCapture) {
      const dr = Math.sign(to.row - from.row);
      const dc = Math.sign(to.col - from.col);
      if (dr !== 0 || dc !== 0) {
        const slideRow = to.row + dr;
        const slideCol = to.col + dc;
        if (
          this.isInside(slideRow, slideCol)
          && !isBlockedTileSquare(slideRow, slideCol)
          && !this.board[slideRow][slideCol]
        ) {
          this.board[slideRow][slideCol] = this.board[to.row][to.col];
          this.board[to.row][to.col] = null;
          currentSquareAfterMove = { row: slideRow, col: slideCol };
        }
      }
    }

    if (capturedPiece && capturedPiece.type === "queen" && hasActiveEffect(capturedPiece.color, 37)) {
      const homeSquare = capturedPiece.color === "white" ? { row: 7, col: 3 } : { row: 0, col: 3 };
      if (!this.board[homeSquare.row][homeSquare.col]) {
        this.board[homeSquare.row][homeSquare.col] = { type: "queen", color: capturedPiece.color, originParity: (homeSquare.row + homeSquare.col) % 2 };
        this.removeMostRecentLostPiece(capturedPiece.color, "queen");
      }
    }

    if (piece.type === "pawn") {
      const chosenType = this.promotionOptions.includes(promotionType) ? promotionType : "queen";
      const earlyPromoRow = piece.color === "white" ? 3 : 4;
      const hasPawnFactory = hasActiveEffect(piece.color, 19);
      const hasLuckyPromotion = hasActiveEffect(piece.color, 50);

      const promotionRow = piece.color === "white" ? 0 : 7;
      if (!isStageHazardActive(67) && (to.row === promotionRow || (hasPawnFactory && to.row === earlyPromoRow))) {
        this.board[to.row][to.col] = { type: chosenType, color: piece.color, originParity: (to.row + to.col) % 2 };

        if (hasLuckyPromotion) {
          const spawnOffsets = [
            [-1, 0], [1, 0], [0, -1], [0, 1],
            [-1, -1], [-1, 1], [1, -1], [1, 1],
          ];
          for (const [dr, dc] of spawnOffsets) {
            const r = to.row + dr;
            const c = to.col + dc;
            if (this.isInside(r, c) && !this.board[r][c]) {
              this.board[r][c] = { type: "knight", color: piece.color, originParity: (r + c) % 2 };
              break;
            }
          }

          consumeActiveEffect(piece.color, 50);
        }
      }

      if (isStageHazardActive(80) && didCapture && capturedTypeForPawnEmpowerment) {
        const promoteTo = capturedTypeForPawnEmpowerment === "king" ? "queen" : capturedTypeForPawnEmpowerment;
        this.board[currentSquareAfterMove.row][currentSquareAfterMove.col] = {
          type: promoteTo,
          color: piece.color,
          originParity: (currentSquareAfterMove.row + currentSquareAfterMove.col) % 2,
        };
      }
    }

    if ((isStageHazardActive(86) || isStageHazardActive(88)) && isMineSquare(currentSquareAfterMove.row, currentSquareAfterMove.col)) {
      const landedPiece = this.board[currentSquareAfterMove.row][currentSquareAfterMove.col];
      if (isStageHazardActive(86) && landedPiece && landedPiece.type !== "king") {
        this.recordLostPiece(landedPiece);
        this.board[currentSquareAfterMove.row][currentSquareAfterMove.col] = null;
        didCapture = true;
      }
    }

    this.enPassantTarget = null;
    if (piece.type === "pawn" && Math.abs(to.row - from.row) === 2) {
      const middleRow = (to.row + from.row) / 2;
      this.enPassantTarget = {
        target: { row: middleRow, col: to.col },
        pawn: { row: to.row, col: to.col },
        pawnColor: piece.color,
        capturableBy: piece.color === "white" ? "black" : "white",
      };
    }

    this.bonusMove = null;

    if (hasActiveEffect(movingColor, 31) && piece.type === "knight" && !!capturedPiece) {
      this.bonusMove = {
        color: movingColor,
        requiredType: "knight",
        exactFrom: { row: to.row, col: to.col },
      };
    }

    if (hasActiveEffect(movingColor, 41) && piece.type === "rook" && !capturedPiece) {
      this.bonusMove = {
        color: movingColor,
        requiredType: "rook",
        exactFrom: { row: to.row, col: to.col },
      };
    }

    if (hasActiveEffect(movingColor, 49) && piece.type === "queen" && !!capturedPiece) {
      this.bonusMove = {
        color: movingColor,
        requiredType: "pawn",
      };
    }

    if (!this.bonusMove && this.pendingBonusTurns[movingColor] > 0) {
      this.pendingBonusTurns[movingColor] -= 1;
      this.bonusMove = {
        color: movingColor,
        requiredType: null,
      };
    }

    const opponentInCheckAfterMove = this.isInCheck(opponentColor);
    if (this.bonusMove && opponentInCheckAfterMove) {
      // Prevent chaining bonus turns while giving check.
      this.bonusMove = null;
    }

    this.turn = this.bonusMove ? movingColor : opponentColor;

    if (hasActiveEffect(movingColor, 34) && !wasBonusMove) {
      this.safePassageShields[movingColor] = {
        row: to.row,
        col: to.col,
        remainingEnemyMoves: 1,
      };
    }

    if (this.safePassageShields[opponentColor]) {
      this.safePassageShields[opponentColor].remainingEnemyMoves -= 1;
      if (this.safePassageShields[opponentColor].remainingEnemyMoves <= 0) {
        this.safePassageShields[opponentColor] = null;
      }
    }

    if (isStageHazardActive(70)) {
      clearCaptureCooldownForColor(movingColor);
      if (didCapture) {
        setCaptureCooldownSquare(movingColor, currentSquareAfterMove.row, currentSquareAfterMove.col);
      }
    } else {
      resetCaptureCooldown();
    }

    if (isStageHazardActive(100)) {
      stageHazardRuntime.bloodlustHalfMovesWithoutCapture = didCapture
        ? 0
        : stageHazardRuntime.bloodlustHalfMovesWithoutCapture + 1;

      if (stageHazardRuntime.bloodlustHalfMovesWithoutCapture >= 6) {
        this.gameOver = true;
        this.winner = null;
        this.lastMessage = "Bloodlust: no captures in 3 turns. Draw.";
        return { ok: true, state: this.getState() };
      }
    } else {
      stageHazardRuntime.bloodlustHalfMovesWithoutCapture = 0;
    }

    const nowInCheck = this.isInCheck(this.turn);
    const canMove = this.hasAnyLegalMove(this.turn);
    const forcedNext = this.getForcedEnPassantMoves(this.turn);

    if (!canMove && nowInCheck) {
      if (isStageHazardActive(92)) {
        this.gameOver = true;
        this.winner = null;
        this.lastMessage = "Lame Victory: checkmate converts to stalemate.";
      } else
      if (hasActiveEffect(this.turn, 46) && this.applyRoyalMercy(this.turn)) {
        consumeActiveEffect(this.turn, 46);
        this.lastMessage = `${this.turn} triggered Royal Mercy.`;
      } else {
        this.gameOver = true;
        this.winner = isStageHazardActive(89)
          ? this.turn
          : (this.turn === "white" ? "black" : "white");
        this.lastMessage = `Checkmate. ${this.winner} wins.`;
      }
    } else if (!canMove) {
      this.gameOver = true;
      this.winner = null;
      this.lastMessage = "Stalemate.";
    } else {
      const messages = [];
      if (nowInCheck) {
        messages.push(`${this.turn} is in check.`);
      }
      if (forcedNext.length > 0) {
        messages.push(`${this.turn} must play en passant.`);
      }
      if (messages.length === 0) {
        messages.push(`${this.turn} to move.`);
      }
      this.lastMessage = messages.join(" ");
    }

    return { ok: true, state: this.getState() };
  }
}

const game = new ChessGame();
const boardEl = document.getElementById("board");
const statusTextEl = document.getElementById("statusText");
const detailTextEl = document.getElementById("detailText");
const resetBtnEl = document.getElementById("resetBtn");
const undoBtnEl = document.getElementById("undoBtn");
const emptyBoardBtnEl = document.getElementById("emptyBoardBtn");
const promotionModalEl = document.getElementById("promotionModal");
const promotionChoicesEl = document.getElementById("promotionChoices");
const gameOverModalEl = document.getElementById("gameOverModal");
const gameOverCardEl = document.getElementById("gameOverCard");
const gameOverTitleEl = document.getElementById("gameOverTitle");
const gameOverTextEl = document.getElementById("gameOverText");
const playAgainBtnEl = document.getElementById("playAgainBtn");
const whiteEffectsListEl = document.getElementById("whiteEffectsList");
const blackEffectsListEl = document.getElementById("blackEffectsList");
const whiteLostPiecesListEl = document.getElementById("whiteLostPiecesList");
const blackLostPiecesListEl = document.getElementById("blackLostPiecesList");
const effectPickerModalEl = document.getElementById("effectPickerModal");
const effectPickerPromptEl = document.getElementById("effectPickerPrompt");
const effectPickerChoicesEl = document.getElementById("effectPickerChoices");
const turnCounterTextEl = document.getElementById("turnCounterText");
const stageHazardTextEl = document.getElementById("stageHazardText");
const stageHazardDetailTextEl = document.getElementById("stageHazardDetailText");
const saveBtnEl = document.getElementById("saveBtn");

let selected = null;
let legalTargets = [];
let pendingPromotion = null;
let pendingEffectDraft = null;
let devBoardEditMode = false;
let waluigiBuffer = "";
let completedPlyCount = 0;
let currentFullTurn = 1;
let stageHazardState = {
  active: null,
  remainingTurns: 0,
  activatedOnTurn: null,
};

let stageHazardRuntime = {
  frostbiteType: null,
  mines: new Set(),
  blockedTiles: new Set(),
  bloodlustHalfMovesWithoutCapture: 0,
};

const syncInstanceId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
let syncLocalWriteCounter = 0;
let latestSeenSyncRevision = 0;
let isApplyingRemoteSnapshot = false;
let currentSaveGameName = "";
let currentSaveGameStateRef = null;
let stopFirebaseRealtimeSync = null;
let lastMovedSquare = null;
let powerUpLightningSquare = null;
let clearPowerUpLightningTimeoutId = null;
let hasPlayedCheckmateAudio = false;
let hasPlayedStalemateAudio = false;

const powerUpAudio = new Audio(POWERUP_SOUND_PATH);
powerUpAudio.preload = "auto";
const checkmateAudio = new Audio(CHECKMATE_SOUND_PATH);
checkmateAudio.preload = "auto";
const stalemateAudio = new Audio(STALEMATE_SOUND_PATH);
stalemateAudio.preload = "auto";

function stopAllGameAudio() {
  [powerUpAudio, checkmateAudio, stalemateAudio].forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
}

let captureCooldownByColor = {
  white: new Set(),
  black: new Set(),
};

function getActiveStageHazardId() {
  return stageHazardState.active ? stageHazardState.active.id : null;
}

function isStageHazardActive(hazardId) {
  return getActiveStageHazardId() === hazardId;
}

function squareKey(row, col) {
  return `${row}-${col}`;
}

function squareFromKey(key) {
  const [rowStr, colStr] = key.split("-");
  return { row: Number(rowStr), col: Number(colStr) };
}

function ensureOriginParity(piece, row, col) {
  if (!piece) {
    return piece;
  }
  if (piece.originParity == null) {
    piece.originParity = (row + col) % 2;
  }
  return piece;
}

function isMineSquare(row, col) {
  return stageHazardRuntime.mines.has(squareKey(row, col));
}

function isBlockedTileSquare(row, col) {
  return stageHazardRuntime.blockedTiles.has(squareKey(row, col));
}

function isOnOrAdjacentToMine(row, col) {
  for (const mineKey of stageHazardRuntime.mines) {
    const mineSquare = squareFromKey(mineKey);
    if (Math.abs(mineSquare.row - row) <= 1 && Math.abs(mineSquare.col - col) <= 1) {
      return true;
    }
  }
  return false;
}

function resetStageHazardRuntime() {
  stageHazardRuntime.frostbiteType = null;
  stageHazardRuntime.mines = new Set();
  stageHazardRuntime.blockedTiles = new Set();
  stageHazardRuntime.bloodlustHalfMovesWithoutCapture = 0;
}

function isSquareBlockedByCaptureCooldown(color, row, col) {
  return captureCooldownByColor[color].has(squareKey(row, col));
}

function setCaptureCooldownSquare(color, row, col) {
  captureCooldownByColor[color].add(squareKey(row, col));
}

function clearCaptureCooldownForColor(color) {
  captureCooldownByColor[color].clear();
}

function resetCaptureCooldown() {
  captureCooldownByColor.white.clear();
  captureCooldownByColor.black.clear();
}

function isLightSquare(row, col) {
  return (row + col) % 2 === 0;
}

function isDarkSquare(row, col) {
  return !isLightSquare(row, col);
}

function isCenterLockSquare(row, col) {
  return (row === 3 || row === 4) && (col === 3 || col === 4);
}

function isPieceFrozenByHazard(piece, row, col) {
  if (!piece) {
    return false;
  }

  const activeHazard = getActiveStageHazardId();
  if (!activeHazard) {
    return false;
  }

  if (activeHazard === 51 && piece.type === "bishop") {
    return true;
  }

  if (activeHazard === 85 && stageHazardRuntime.frostbiteType && piece.type === stageHazardRuntime.frostbiteType) {
    return true;
  }

  if (activeHazard === 88 && isOnOrAdjacentToMine(row, col)) {
    return true;
  }

  return false;
}

const WALUIGI_CODE = "waluigi";
const BOARD_EDIT_PIECE_CYCLE = [
  null,
  { color: "white", type: "pawn" },
  { color: "white", type: "knight" },
  { color: "white", type: "bishop" },
  { color: "white", type: "rook" },
  { color: "white", type: "queen" },
  { color: "white", type: "king" },
  { color: "black", type: "pawn" },
  { color: "black", type: "knight" },
  { color: "black", type: "bishop" },
  { color: "black", type: "rook" },
  { color: "black", type: "queen" },
  { color: "black", type: "king" },
];

const BENEFICIAL_EFFECT_POOL = [
  { id: 1, name: "Rook Rocket", duration: 3, category: "Beneficial", description: "Rooks may jump past one blocker on straight lines." },
  { id: 2, name: "Knight Relay", duration: 2, category: "Beneficial", description: "Knights also get extended 3-1 leaps." },
  { id: 3, name: "Bishop Drift", duration: 4, category: "Beneficial", description: "Bishops can also move one square orthogonally." },
  { id: 4, name: "Queen Shield", duration: 3, category: "Beneficial", description: "Enemy pawns cannot capture your queen." },
  { id: 5, name: "Pawn Sprint", duration: 2, category: "Beneficial", description: "Pawns may move two squares from any rank if clear." },
  { id: 6, name: "Fortress File", duration: 3, category: "Beneficial", description: "Rooks can also move one square diagonally." },
  { id: 7, name: "Royal Glide", duration: 2, category: "Beneficial", description: "King may move two squares orthogonally." },
  { id: 8, name: "Ghost Pawns", duration: 2, category: "Beneficial", description: "Pawns can hop through a blocked first forward square." },
  { id: 9, name: "Archer Bishops", duration: 3, category: "Beneficial", description: "Bishops can capture one square orthogonally." },
  { id: 10, name: "Heavy Queen", duration: 4, category: "Beneficial", description: "Enemy queen cannot capture your queen." },
  { id: 11, name: "Knight Warp", duration: 2, category: "Beneficial", description: "Knights can teleport to any empty opposite-color square." },
  { id: 12, name: "Lucky Castle", duration: 1, category: "Beneficial", description: "Castling rights loss is ignored this turn from home square." },
  { id: 13, name: "Pawn Armor", duration: 3, category: "Beneficial", description: "Your pawns cannot be captured." },
  { id: 14, name: "Rook Magnet", duration: 2, category: "Beneficial", description: "Rooks can capture adjacent diagonal pieces." },
  { id: 15, name: "Bishop Tunnel", duration: 3, category: "Beneficial", description: "Bishops can pass through one blocker on diagonals." },
  { id: 16, name: "Queen Echo", duration: 2, category: "Beneficial", description: "Queen also gains knight jumps." },
  { id: 17, name: "Knight Net", duration: 2, category: "Beneficial", description: "Enemy king cannot move to squares near your knights." },
  { id: 18, name: "Royal Guard", duration: 3, category: "Beneficial", description: "Pieces next to your king are immune to bishop/knight captures." },
  { id: 19, name: "Pawn Factory", duration: 1, category: "Beneficial", description: "Pawns promote early when reaching the fifth rank for white and fourth rank for black." },
  { id: 20, name: "Backline Boost", duration: 3, category: "Beneficial", description: "Back-rank pieces can step one square forward if empty." },
  { id: 21, name: "Diagonal Charge", duration: 2, category: "Beneficial", description: "Pawns may move diagonally into empty squares." },
  { id: 22, name: "Iron Rook", duration: 4, category: "Beneficial", description: "Enemy pawns cannot capture your rooks." },
  { id: 23, name: "Bishop Beam", duration: 2, category: "Beneficial", description: "Bishops can capture by jumping over one enemy on a diagonal." },
  { id: 24, name: "Queen Leap", duration: 3, category: "Beneficial", description: "Queen can pass through one blocker on straight lines." },
  { id: 25, name: "Knight Armor", duration: 3, category: "Beneficial", description: "Your knights cannot be captured." },
  { id: 26, name: "Pawn Recall", duration: 2, category: "Beneficial", description: "Pawns can move backward one square if empty." },
  { id: 27, name: "Royal Blessing", duration: 3, category: "Beneficial", description: "King may move diagonally like bishops." },
  { id: 28, name: "Rook Slide", duration: 3, category: "Beneficial", description: "Rooks gain one-square diagonal movement." },
  { id: 29, name: "Bishop Burst", duration: 2, category: "Beneficial", description: "Bishops can pass through up to two blockers on diagonals." },
  { id: 30, name: "Queen Split", duration: 2, category: "Beneficial", description: "Queen moves can chain a one-square orthogonal step." },
  { id: 31, name: "Knight Charge", duration: 2, category: "Beneficial", description: "Knight captures grant an immediate extra knight move." },
  { id: 32, name: "Pawn Web", duration: 3, category: "Beneficial", description: "Pawns also attack and capture directly forward." },
  { id: 33, name: "Tempo Surge", duration: 1, category: "Beneficial", description: "Instantly grants a bonus turn." },
  { id: 34, name: "Safe Passage", duration: 3, category: "Beneficial", description: "First move each turn cannot be captured on next enemy move." },
  { id: 35, name: "Rook Barricade", duration: 3, category: "Beneficial", description: "Squares next to your rooks are forbidden for enemy kings." },
  { id: 36, name: "Divine Blessing", duration: 1, category: "Beneficial", description: "Bishops behave as queens for 1 turn." },
  { id: 37, name: "Queen Recovery", duration: 2, category: "Beneficial", description: "Captured queen returns to home square if empty." },
  { id: 38, name: "Knight Ladder", duration: 3, category: "Beneficial", description: "Knights can also move one square diagonally." },
  { id: 39, name: "Pawn Reinforce", duration: 3, category: "Beneficial", description: "Pawns with file support cannot be captured by pawns." },
  { id: 40, name: "King Swap", duration: 2, category: "Beneficial", description: "King may swap with adjacent friendly piece." },
  { id: 41, name: "Rook Overdrive", duration: 2, category: "Beneficial", description: "Non-capturing rook moves grant immediate extra rook move." },
  { id: 42, name: "Bishop Echo", duration: 2, category: "Beneficial", description: "A bishop move also nudges another bishop the same direction." },
  { id: 43, name: "Queen Fortress", duration: 2, category: "Beneficial", description: "Enemy queens cannot capture your queen." },
  { id: 44, name: "Knight Pivot", duration: 3, category: "Beneficial", description: "Knights can also move one square in any direction." },
  { id: 45, name: "Pawn Storm", duration: 1, category: "Beneficial", description: "Pawns gain one extra forward step this turn." },
  { id: 46, name: "Royal Mercy", duration: null, category: "Beneficial", description: "Persists until it prevents your next checkmate once." },
  { id: 47, name: "Rook Chain", duration: 4, category: "Beneficial", description: "Rooks linked on same rank/file gain capture protection." },
  { id: 48, name: "Bishop Prism", duration: 2, category: "Beneficial", description: "Bishops can step one orthogonal square to switch color parity." },
  { id: 49, name: "Queen Momentum", duration: 3, category: "Beneficial", description: "Queen captures grant immediate extra pawn move." },
  { id: 50, name: "Lucky Promotion", duration: null, category: "Beneficial", description: "Persists until your next promotion, then spawns a bonus knight." },
];

const STAGE_HAZARDS_POOL = [
  { id: 51, name: "Heavenly Freeze", description: "All bishops cannot move." },
  { id: 52, name: "Horse Toxins", description: "All knights cannot capture." },
  { id: 53, name: "Rook Traffic", description: "Rooks can only move up to 3 squares." },
  { id: 54, name: "Income Inequality", description: "Queens can only move to capture." },
  { id: 55, name: "Pawn Truce", description: "Pawns cannot capture each other." },
  { id: 56, name: "Royal Curfew", description: "Kings cannot move to edge files (a or h)." },
  { id: 57, name: "Nyctophobia", description: "No piece may end a move on dark squares." },
  { id: 58, name: "Photophobia", description: "No piece may end a move on light squares." },
  { id: 59, name: "Center Lock", description: "No piece may move into d4, e4, d5, or e5." },
  { id: 60, name: "Edge Lock", description: "Pieces on edge files cannot move." },
  { id: 61, name: "Truce", description: "No captures are allowed." },
  { id: 62, name: "Heavy Board", description: "All non-knight pieces move at most 2 squares." },
  { id: 63, name: "Determination", description: "Pieces may not move backwards." },
  { id: 64, name: "Fog Files", description: "Pieces on c and f files cannot leave the file." },
  { id: 65, name: "Crosswind", description: "Only Bishops may move diagonally." },
  { id: 66, name: "Mud Ranks", description: "Pieces on rank 4 & 5 cannot move." },
  { id: 67, name: "Budget Cuts", description: "Pawns cannot promote." },
  { id: 68, name: "Guard Lock", description: "Castling is disabled for both players." },
  { id: 69, name: "Nostalgia Bait", description: "Remove all active effects for both players. Players cannot get new effects." },
  { id: 70, name: "Capture Cooldown", description: "Any piece that captures cannot move next turn." },
  { id: 71, name: "Bergentruckung", description: "All kings can move like queens." },
  { id: 72, name: "Defensive Ranks", description: "Pieces on rank 2 and 7 cannot be captured." },
  { id: 73, name: "Women's Equality", description: "Queens move like kings only." },
  { id: 74, name: "Heavy Horseshoes", description: "Knights may not jump; they move one square orthogonally." },
  { id: 75, name: "Church Tithes", description: "Pieces adjacent to Bishops may not move." },
  { id: 76, name: "Cowardly Pawns", description: "Pawns may move only backward one square." },
  { id: 77, name: "Tilted Towers", description: "Rooks can only move diagonally one square." },
  { id: 78, name: "Racist Knights", description: "Knights can only move to light squares." },
  { id: 79, name: "Royal Pacifism", description: "Queens and Kings cannot capture." },
  { id: 80, name: "Pawn Empowerment", description: "If a pawn captures a piece, it must promote to that piece." },
  { id: 81, name: "Chaos Vortex of Devastating Horrors", description: "En passant is not allowed." },
  { id: 82, name: "Monotony", description: "All pieces can only move like pawns." },
  { id: 83, name: "Rook Slide", description: "After a Rook captures a piece, it will move one more space in the direction it was going.." },
  { id: 84, name: "Horse Riding", description: "Kings can move like knights." },
  { id: 85, name: "Frostbite", description: "At each turn start, one piece type is frozen for both players." },
  { id: 86, name: "Minefield", description: "3 mines are placed on empty board squares. Pieces landing on them are captured." },
  { id: 87, name: "Pawn Ceiling", description: "Pawns cannot move beyond rank 5 (white) or rank 4 (black)." },
  { id: 88, name: "Frost Mines", description: "3 mines are placed on the board. Pieces on or adjacent to them cannot move." },
  { id: 89, name: "Uno Reverse", description: "If a player gets checkmated, they win." },
  { id: 90, name: "Female Empowerment", description: "The Queen cannot move only one space." },
  { id: 91, name: "Color Lock", description: "Pieces must remain on the color of square they started from." },
  { id: 92, name: "Lame Victory", description: "If checkmated, the game ends in a stalemate instead." },
  { id: 93, name: "Knight's Armor", description: "Knights cannot be captured." },
  { id: 94, name: "Church Mass", description: "Bishops must move exactly 2 squares." },
  { id: 95, name: "Road Work Ahead", description: "Rooks must move exactly 2 squares." },
  { id: 96, name: "Rook Evolution", description: "Rooks move like queens." },
  { id: 97, name: "Catholic Church", description: "Bishops move like queens." },
  { id: 98, name: "Scaredy King", description: "Friendly pieces may not move next to their king." },
  { id: 99, name: "Meteor Shower", description: "Random empty square becomes blocked each turn." },
  { id: 100, name: "Bloodlust", description: "If no capture occurs in 3 turns, game auto-declares draw." },
];

const activeEffects = {
  white: [],
  black: [],
};

function hasActiveEffect(color, effectId) {
  if (isStageHazardActive(69)) {
    return false;
  }
  return activeEffects[color].some((effect) => effect.id === effectId && effect.remainingTurns > 0);
}

function consumeActiveEffect(color, effectId) {
  activeEffects[color] = activeEffects[color].filter((effect) => effect.id !== effectId);
}

function getEffectById(effectId) {
  return BENEFICIAL_EFFECT_POOL.find((effect) => effect.id === effectId) || null;
}

function uniqueMoves(moves) {
  const seen = new Set();
  const unique = [];

  moves.forEach((move) => {
    const key = `${move.row}-${move.col}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    unique.push(move);
  });

  return unique;
}

function samePiece(a, b) {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return a.color === b.color && a.type === b.type;
}

function nextCyclePiece(current, reverse = false) {
  const currentIndex = BOARD_EDIT_PIECE_CYCLE.findIndex((entry) => samePiece(entry, current));
  const startIndex = currentIndex >= 0 ? currentIndex : 0;
  const delta = reverse ? -1 : 1;
  const nextIndex = (startIndex + delta + BOARD_EDIT_PIECE_CYCLE.length) % BOARD_EDIT_PIECE_CYCLE.length;
  const next = BOARD_EDIT_PIECE_CYCLE[nextIndex];
  return next ? { ...next } : null;
}

function squareToId(row, col) {
  return `${row}-${col}`;
}

function clonePlainBoard(board) {
  if (!board || typeof board !== "object") {
    return Array.from({ length: 8 }, () => Array(8).fill(null));
  }

  const readIndexed = (container, index) => {
    if (!container || typeof container !== "object") {
      return undefined;
    }
    if (Array.isArray(container)) {
      return container[index];
    }
    return container[String(index)];
  };

  const normalized = [];
  for (let row = 0; row < 8; row += 1) {
    const sourceRow = readIndexed(board, row);
    const nextRow = [];
    for (let col = 0; col < 8; col += 1) {
      const sourcePiece = readIndexed(sourceRow, col);
      if (!sourcePiece) {
        nextRow.push(null);
        continue;
      }
      nextRow.push(ensureOriginParity({ ...sourcePiece }, row, col));
    }
    normalized.push(nextRow);
  }

  return normalized;
}

function cloneEffectsForSync(effects) {
  if (!Array.isArray(effects)) {
    return [];
  }

  return effects.map((effect) => ({
    id: Number(effect.id),
    name: String(effect.name),
    description: String(effect.description),
    remainingTurns: Number(effect.remainingTurns),
    isPersistentUntilUsed: !!effect.isPersistentUntilUsed,
  }));
}

function normalizeEffectsFromSync(effects) {
  if (!Array.isArray(effects)) {
    return [];
  }

  return effects
    .filter((effect) => effect && Number.isFinite(Number(effect.id)))
    .map((effect) => ({
      id: Number(effect.id),
      name: String(effect.name || "Unknown Effect"),
      description: String(effect.description || ""),
      remainingTurns: Number(effect.remainingTurns),
      isPersistentUntilUsed: !!effect.isPersistentUntilUsed,
    }))
    .filter((effect) => effect.remainingTurns > 0);
}

function normalizeLostPiecesFromSync(lostPieces) {
  const allowedTypes = new Set(["pawn", "knight", "bishop", "rook", "queen", "king"]);
  const normalizeSide = (side) => {
    if (!Array.isArray(side)) {
      return [];
    }
    return side
      .map((pieceType) => String(pieceType || "").toLowerCase())
      .filter((pieceType) => allowedTypes.has(pieceType));
  };

  return {
    white: normalizeSide(lostPieces && lostPieces.white),
    black: normalizeSide(lostPieces && lostPieces.black),
  };
}

function findHazardById(hazardId) {
  if (!Number.isFinite(Number(hazardId))) {
    return null;
  }
  return STAGE_HAZARDS_POOL.find((hazard) => hazard.id === Number(hazardId)) || null;
}

function setFromArray(values) {
  if (!Array.isArray(values)) {
    return new Set();
  }
  return new Set(values.filter((value) => typeof value === "string"));
}

function collectFrozenSquares() {
  const frozenSquares = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = game.board[row][col];
      if (!piece) {
        continue;
      }
      if (isPieceFrozenByHazard(piece, row, col)) {
        frozenSquares.push(squareKey(row, col));
      }
    }
  }
  return frozenSquares;
}

function sanitizeForFirebase(value) {
  if (value === undefined) {
    return null;
  }

  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForFirebase(entry));
  }

  if (typeof value === "object") {
    const sanitized = {};
    Object.keys(value).forEach((key) => {
      sanitized[key] = sanitizeForFirebase(value[key]);
    });
    return sanitized;
  }

  return value;
}

function buildSyncSnapshot() {
  return {
    game: {
      board: clonePlainBoard(game.board),
      customStartingBoard: game.customStartingBoard ? clonePlainBoard(game.customStartingBoard) : null,
      lostPieces: {
        white: [...game.lostPieces.white],
        black: [...game.lostPieces.black],
      },
      turn: game.turn,
      winner: game.winner,
      gameOver: game.gameOver,
      castlingRights: {
        white: { ...game.castlingRights.white },
        black: { ...game.castlingRights.black },
      },
      enPassantTarget: game.enPassantTarget
        ? {
          target: { ...game.enPassantTarget.target },
          pawn: { ...game.enPassantTarget.pawn },
          pawnColor: game.enPassantTarget.pawnColor,
          capturableBy: game.enPassantTarget.capturableBy,
        }
        : null,
      bonusMove: game.bonusMove ? { ...game.bonusMove } : null,
      pendingBonusTurns: { ...game.pendingBonusTurns },
      safePassageShields: {
        white: game.safePassageShields.white ? { ...game.safePassageShields.white } : null,
        black: game.safePassageShields.black ? { ...game.safePassageShields.black } : null,
      },
      lastMessage: game.lastMessage,
    },
    runtime: {
      activeEffects: {
        white: cloneEffectsForSync(activeEffects.white),
        black: cloneEffectsForSync(activeEffects.black),
      },
      completedPlyCount,
      currentFullTurn,
      stageHazardState: {
        activeId: stageHazardState.active ? stageHazardState.active.id : null,
        remainingTurns: stageHazardState.remainingTurns,
        activatedOnTurn: stageHazardState.activatedOnTurn,
      },
      stageHazardRuntime: {
        frostbiteType: stageHazardRuntime.frostbiteType ?? null,
        mines: Array.from(stageHazardRuntime.mines),
        blockedTiles: Array.from(stageHazardRuntime.blockedTiles),
        bloodlustHalfMovesWithoutCapture: stageHazardRuntime.bloodlustHalfMovesWithoutCapture,
        frozenSquares: collectFrozenSquares(),
      },
      captureCooldownByColor: {
        white: Array.from(captureCooldownByColor.white),
        black: Array.from(captureCooldownByColor.black),
      },
      pendingPromotion: pendingPromotion ?? null,
      pendingEffectDraft: pendingEffectDraft ?? null,
      devBoardEditMode,
    },
  };
}

function applySnapshotToRuntime(snapshot) {
  if (!snapshot || !snapshot.game || !snapshot.runtime) {
    return false;
  }

  const gameState = snapshot.game;
  const runtimeState = snapshot.runtime;

  game.board = clonePlainBoard(gameState.board);
  game.customStartingBoard = gameState.customStartingBoard
    ? clonePlainBoard(gameState.customStartingBoard)
    : null;
  game.lostPieces = normalizeLostPiecesFromSync(gameState.lostPieces);

  game.turn = gameState.turn === "black" ? "black" : "white";
  game.winner = gameState.winner === "white" || gameState.winner === "black" ? gameState.winner : null;
  game.gameOver = !!gameState.gameOver;
  game.castlingRights = {
    white: {
      kingSide: !!(gameState.castlingRights && gameState.castlingRights.white && gameState.castlingRights.white.kingSide),
      queenSide: !!(gameState.castlingRights && gameState.castlingRights.white && gameState.castlingRights.white.queenSide),
    },
    black: {
      kingSide: !!(gameState.castlingRights && gameState.castlingRights.black && gameState.castlingRights.black.kingSide),
      queenSide: !!(gameState.castlingRights && gameState.castlingRights.black && gameState.castlingRights.black.queenSide),
    },
  };
  game.enPassantTarget = gameState.enPassantTarget || null;
  game.bonusMove = gameState.bonusMove || null;
  game.pendingBonusTurns = {
    white: Number(gameState.pendingBonusTurns && gameState.pendingBonusTurns.white) || 0,
    black: Number(gameState.pendingBonusTurns && gameState.pendingBonusTurns.black) || 0,
  };
  game.safePassageShields = {
    white: gameState.safePassageShields && gameState.safePassageShields.white
      ? { ...gameState.safePassageShields.white }
      : null,
    black: gameState.safePassageShields && gameState.safePassageShields.black
      ? { ...gameState.safePassageShields.black }
      : null,
  };
  game.lastMessage = String(gameState.lastMessage || "white to move");

  activeEffects.white = normalizeEffectsFromSync(runtimeState.activeEffects && runtimeState.activeEffects.white);
  activeEffects.black = normalizeEffectsFromSync(runtimeState.activeEffects && runtimeState.activeEffects.black);

  completedPlyCount = Number(runtimeState.completedPlyCount) || 0;
  currentFullTurn = Number(runtimeState.currentFullTurn) || 1;

  const nextHazard = findHazardById(runtimeState.stageHazardState && runtimeState.stageHazardState.activeId);
  stageHazardState = {
    active: nextHazard,
    remainingTurns: Number(runtimeState.stageHazardState && runtimeState.stageHazardState.remainingTurns) || 0,
    activatedOnTurn: Number(runtimeState.stageHazardState && runtimeState.stageHazardState.activatedOnTurn) || null,
  };

  stageHazardRuntime = {
    frostbiteType: runtimeState.stageHazardRuntime ? runtimeState.stageHazardRuntime.frostbiteType : null,
    mines: setFromArray(runtimeState.stageHazardRuntime && runtimeState.stageHazardRuntime.mines),
    blockedTiles: setFromArray(runtimeState.stageHazardRuntime && runtimeState.stageHazardRuntime.blockedTiles),
    bloodlustHalfMovesWithoutCapture: Number(
      runtimeState.stageHazardRuntime && runtimeState.stageHazardRuntime.bloodlustHalfMovesWithoutCapture,
    ) || 0,
  };

  captureCooldownByColor = {
    white: setFromArray(runtimeState.captureCooldownByColor && runtimeState.captureCooldownByColor.white),
    black: setFromArray(runtimeState.captureCooldownByColor && runtimeState.captureCooldownByColor.black),
  };

  pendingPromotion = runtimeState.pendingPromotion || null;
  pendingEffectDraft = runtimeState.pendingEffectDraft || null;
  devBoardEditMode = !!runtimeState.devBoardEditMode;

  if (!pendingPromotion) {
    closePromotionPicker();
  } else {
    openPromotionPicker(pendingPromotion.color);
  }

  if (!pendingEffectDraft) {
    closeEffectPicker();
  } else {
    openEffectPicker();
  }

  lastMovedSquare = null;
  clearPowerUpLightningEffect();
  clearSelection();
  return true;
}

function nextSyncRevision() {
  syncLocalWriteCounter += 1;
  return Date.now() * 1000 + (syncLocalWriteCounter % 1000);
}

async function saveStateToFirebase(trigger) {
  if (isApplyingRemoteSnapshot) {
    return { ok: false, error: new Error("State sync is currently applying a remote update.") };
  }

  if (!currentSaveGameStateRef) {
    return { ok: false, error: new Error("No game name selected. Reload and choose a game name.") };
  }

  const payload = {
    revision: nextSyncRevision(),
    updatedAt: Date.now(),
    updatedBy: syncInstanceId,
    trigger,
    gameName: currentSaveGameName,
    snapshot: sanitizeForFirebase(buildSyncSnapshot()),
  };

  latestSeenSyncRevision = payload.revision;

  try {
    await set(currentSaveGameStateRef, payload);
    return { ok: true, error: null };
  } catch (error) {
    console.error("Firebase save failed:", error);
    detailTextEl.textContent = "Firebase save failed. Check database rules and connection.";
    return { ok: false, error };
  }
}

async function loadStateFromFirebase(options = {}) {
  const { showMissingMessage = false, showLoadedMessage = true } = options;

  if (!currentSaveGameStateRef) {
    return { loaded: false, missing: false, error: new Error("No game name selected.") };
  }

  try {
    const snapshot = await get(currentSaveGameStateRef);
    if (!snapshot.exists()) {
      if (showMissingMessage) {
        detailTextEl.textContent = `No Firebase save found for \"${currentSaveGameName}\" yet.`;
      }
      return { loaded: false, missing: true, error: null };
    }

    const payload = snapshot.val();
    if (!payload || !payload.snapshot) {
      return { loaded: false, missing: true, error: null };
    }

    isApplyingRemoteSnapshot = true;
    const applied = applySnapshotToRuntime(payload.snapshot);
    isApplyingRemoteSnapshot = false;

    if (applied) {
      latestSeenSyncRevision = Math.max(latestSeenSyncRevision, Number(payload.revision) || 0);
      if (showLoadedMessage) {
        detailTextEl.textContent = `Loaded \"${currentSaveGameName}\" from Firebase.`;
      }
      render();
      return { loaded: true, missing: false, error: null };
    }

    return { loaded: false, missing: false, error: null };
  } catch (error) {
    isApplyingRemoteSnapshot = false;
    console.error("Firebase load failed:", error);
    detailTextEl.textContent = "Firebase load failed. Check database rules and connection.";
    return { loaded: false, missing: false, error };
  }
}

function askForGameName() {
  while (true) {
    const entered = window.prompt("Name the Game:", "");
    if (entered === null) {
      continue;
    }

    const normalized = sanitizeGameName(entered);
    if (!normalized) {
      continue;
    }

    return normalized;
  }
}

async function bootstrapFirebaseState() {
  const shouldRestore = shouldRestoreSavedGameOnReload();
  const rememberedGameName = shouldRestore ? getRememberedGameName() : "";
  const chosenGameName = rememberedGameName || askForGameName();
  setRestoreSavedGameOnReload(false);
  currentSaveGameName = chosenGameName;
  currentSaveGameStateRef = getGameStateRefByName(chosenGameName);
  rememberGameName(chosenGameName);

  if (!currentSaveGameStateRef) {
    detailTextEl.textContent = "Could not create Firebase key from this game name.";
    render();
    return;
  }

  latestSeenSyncRevision = 0;
  startFirebaseStateSync();

  const result = await loadStateFromFirebase({
    showMissingMessage: false,
    showLoadedMessage: false,
  });

  if (result.loaded) {
    detailTextEl.textContent = `Loaded \"${currentSaveGameName}\" from Firebase.`;
    render();
    return;
  }

  if (result.missing) {
    const initSave = await saveStateToFirebase("new-slot-init");
    if (initSave.ok) {
      detailTextEl.textContent = `Created new Firebase save \"${currentSaveGameName}\".`;
    } else {
      const message = initSave.error && initSave.error.message
        ? initSave.error.message
        : "Unknown error";
      detailTextEl.textContent = `Failed to initialize save \"${currentSaveGameName}\": ${message}`;
    }
  }

  render();
}

function startFirebaseStateSync() {
  if (!currentSaveGameStateRef) {
    return;
  }

  if (typeof stopFirebaseRealtimeSync === "function") {
    stopFirebaseRealtimeSync();
    stopFirebaseRealtimeSync = null;
  }

  stopFirebaseRealtimeSync = onValue(currentSaveGameStateRef, (snapshot) => {
    if (!snapshot.exists()) {
      return;
    }

    const payload = snapshot.val();
    if (!payload || !payload.snapshot) {
      return;
    }

    const revision = Number(payload.revision) || 0;
    const isOwnRevision = payload.updatedBy === syncInstanceId && revision === latestSeenSyncRevision;
    if (isOwnRevision || revision < latestSeenSyncRevision) {
      return;
    }

    latestSeenSyncRevision = revision;

    isApplyingRemoteSnapshot = true;
    const applied = applySnapshotToRuntime(payload.snapshot);
    isApplyingRemoteSnapshot = false;

    if (applied) {
      render();
    }
  }, (error) => {
    console.error("Firebase realtime listener failed:", error);
  });
}

async function triggerManualSave(source = "manual-save") {
  const result = await saveStateToFirebase(source);
  if (result.ok) {
    detailTextEl.textContent = `Saved \"${currentSaveGameName}\" to Firebase.`;
    return;
  }

  const message = result.error && result.error.message
    ? result.error.message
    : "Unknown error";
  detailTextEl.textContent = `Firebase save failed: ${message}`;
}

function render() {
  const state = game.getState();
  const activeHazardId = getActiveStageHazardId();
  boardEl.innerHTML = "";

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const square = document.createElement("button");
      square.type = "button";
      square.className = `square ${(row + col) % 2 === 0 ? "light" : "dark"}`;
      square.dataset.row = String(row);
      square.dataset.col = String(col);
      square.id = squareToId(row, col);
      square.setAttribute("role", "gridcell");
      square.setAttribute("aria-label", `Row ${8 - row}, Column ${col + 1}`);

      if (activeHazardId === 64 && (col === 2 || col === 5)) {
        square.classList.add("fog-files-square");
      }

      if (activeHazardId === 66 && (row === 3 || row === 4)) {
        square.classList.add("mud-ranks-square");
      }

      if (selected && selected.row === row && selected.col === col) {
        square.classList.add("selected");
      }

      if (legalTargets.some((m) => m.row === row && m.col === col)) {
        square.classList.add("legal");
      }

      if (powerUpLightningSquare && powerUpLightningSquare.row === row && powerUpLightningSquare.col === col) {
        square.classList.add("powerup-lightning");
      }

      const piece = state.board[row][col];
      if (piece) {
        const img = document.createElement("img");
        img.className = "piece";
        img.src = `Pieces/${piece.color}-${piece.type}.png`;
        img.alt = `${piece.color} ${piece.type}`;
        square.appendChild(img);

        if (isPieceFrozenByHazard(piece, row, col)) {
          const freezeImg = document.createElement("img");
          freezeImg.className = "hazard-icon freeze-icon";
          freezeImg.src = "Hazards/Freeze-Icon.png";
          freezeImg.alt = "Frozen";
          square.appendChild(freezeImg);
        }
      }

      if (isMineSquare(row, col)) {
        const mineImg = document.createElement("img");
        mineImg.className = "hazard-icon mine-icon";
        mineImg.src = "Hazards/Mine-Icon.png";
        mineImg.alt = "Mine";
        square.appendChild(mineImg);
      }

      if (isBlockedTileSquare(row, col)) {
        const meteorImg = document.createElement("img");
        meteorImg.className = "hazard-icon meteor-icon";
        meteorImg.src = "Hazards/Meteor-Icon.png";
        meteorImg.alt = "Blocked tile";
        square.appendChild(meteorImg);
      }

      if (row === 7) {
        const fileLabel = document.createElement("span");
        fileLabel.className = "coord-file";
        fileLabel.textContent = String.fromCharCode(97 + col);
        square.appendChild(fileLabel);
      }

      if (col === 0) {
        const rankLabel = document.createElement("span");
        rankLabel.className = "coord-rank";
        rankLabel.textContent = String(8 - row);
        square.appendChild(rankLabel);
      }

      boardEl.appendChild(square);
    }
  }

  if (!state.gameOver) {
    statusTextEl.textContent = `${capitalize(state.turn)} to move`;
  } else if (state.winner) {
    statusTextEl.textContent = `Checkmate - ${capitalize(state.winner)} wins`;
  } else {
    statusTextEl.textContent = "Stalemate";
  }

  detailTextEl.textContent = state.lastMessage;

  turnCounterTextEl.textContent = `Turn ${currentFullTurn}`;
  if (stageHazardState.active) {
    const turnsLeft = `${stageHazardState.remainingTurns} turn${stageHazardState.remainingTurns === 1 ? "" : "s"} left`;
    const prefix = stageHazardState.activatedOnTurn === currentFullTurn ? "New Stage Hazard" : "Stage Hazard";
    stageHazardTextEl.textContent = `${prefix}: ${stageHazardState.active.name} (${turnsLeft})`;
    stageHazardDetailTextEl.textContent = `Stage Hazard Description: ${stageHazardState.active.description}`;
  } else {
    stageHazardTextEl.textContent = "Stage Hazard: none";
    stageHazardDetailTextEl.textContent = "Stage Hazard Description: none";
  }

  if (pendingEffectDraft) {
    detailTextEl.textContent = `${capitalize(pendingEffectDraft.color)}: choose one random effect.`;
  }

  if (devBoardEditMode) {
    detailTextEl.textContent = "Waluigi mode active: click squares to cycle pieces, Shift+click to reverse. Type 'waluigi' again to exit.";
  }

  const checkedKing = game.findKing(state.turn);
  if (!state.gameOver && checkedKing && game.isInCheck(state.turn)) {
    const id = squareToId(checkedKing.row, checkedKing.col);
    const kingSquare = document.getElementById(id);
    if (kingSquare) {
      kingSquare.classList.add("check");
    }
  }

  renderGameOverFanfare(state);
  renderActiveEffects();
  renderLostPieces();
}

function renderActiveEffects() {
  renderSideEffectsList(whiteEffectsListEl, activeEffects.white);
  renderSideEffectsList(blackEffectsListEl, activeEffects.black);
}

function renderLostPieces() {
  renderSideLostPiecesList(whiteLostPiecesListEl, game.lostPieces.white);
  renderSideLostPiecesList(blackLostPiecesListEl, game.lostPieces.black);
}

function renderSideLostPiecesList(listEl, lostPieces) {
  if (!listEl) {
    return;
  }

  listEl.innerHTML = "";

  if (!Array.isArray(lostPieces) || lostPieces.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No lost pieces";
    listEl.appendChild(empty);
    return;
  }

  const pieceOrder = ["pawn", "knight", "bishop", "rook", "queen", "king"];
  const counts = pieceOrder.reduce((accumulator, pieceType) => {
    accumulator[pieceType] = 0;
    return accumulator;
  }, {});

  lostPieces.forEach((pieceType) => {
    if (Object.prototype.hasOwnProperty.call(counts, pieceType)) {
      counts[pieceType] += 1;
    }
  });

  pieceOrder.forEach((pieceType) => {
    if (counts[pieceType] <= 0) {
      return;
    }

    const li = document.createElement("li");
    li.textContent = `${capitalize(pieceType)} x${counts[pieceType]}`;
    listEl.appendChild(li);
  });
}

function renderSideEffectsList(listEl, effects) {
  listEl.innerHTML = "";

  if (effects.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No active effects";
    listEl.appendChild(empty);
    return;
  }

  effects.forEach((effect) => {
    const li = document.createElement("li");
    const durationLabel = effect.isPersistentUntilUsed
      ? "until used"
      : `${effect.remainingTurns} turn${effect.remainingTurns === 1 ? "" : "s"}`;
    li.textContent = `${effect.name}: ${effect.description} (${durationLabel})`;
    listEl.appendChild(li);
  });
}

function renderGameOverFanfare(state) {
  if (!state.gameOver) {
    gameOverModalEl.hidden = true;
    gameOverCardEl.classList.remove("stalemate");
    hasPlayedCheckmateAudio = false;
    hasPlayedStalemateAudio = false;
    return;
  }

  if (state.winner) {
    gameOverCardEl.classList.remove("stalemate");
    gameOverTitleEl.textContent = "Checkmate";
    gameOverTextEl.textContent = `${capitalize(state.winner)} wins the game.`;

    if (!hasPlayedCheckmateAudio) {
      hasPlayedCheckmateAudio = true;
      hasPlayedStalemateAudio = false;
      try {
        checkmateAudio.currentTime = 0;
        void checkmateAudio.play();
      } catch {
        // Ignore playback failures from browser autoplay restrictions.
      }
    }
  } else {
    gameOverCardEl.classList.add("stalemate");
    gameOverTitleEl.textContent = "Stalemate";
    gameOverTextEl.textContent = "Draw. Nobody wins this one.";
    hasPlayedCheckmateAudio = false;

    if (!hasPlayedStalemateAudio) {
      hasPlayedStalemateAudio = true;
      try {
        stalemateAudio.currentTime = 0;
        void stalemateAudio.play();
      } catch {
        // Ignore playback failures from browser autoplay restrictions.
      }
    }
  }

  gameOverModalEl.hidden = false;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function clearSelection() {
  selected = null;
  legalTargets = [];
}

function clearPowerUpLightningEffect() {
  powerUpLightningSquare = null;
  if (clearPowerUpLightningTimeoutId) {
    window.clearTimeout(clearPowerUpLightningTimeoutId);
    clearPowerUpLightningTimeoutId = null;
  }
}

function triggerPowerUpLightning(color) {
  if (!lastMovedSquare || lastMovedSquare.color !== color) {
    return;
  }

  powerUpLightningSquare = {
    row: lastMovedSquare.row,
    col: lastMovedSquare.col,
  };

  if (clearPowerUpLightningTimeoutId) {
    window.clearTimeout(clearPowerUpLightningTimeoutId);
  }

  clearPowerUpLightningTimeoutId = window.setTimeout(() => {
    clearPowerUpLightningTimeoutId = null;
    powerUpLightningSquare = null;
    render();
  }, POWERUP_LIGHTNING_DURATION_MS);

  try {
    powerUpAudio.currentTime = 0;
    void powerUpAudio.play();
  } catch {
    // Ignore playback failures from browser autoplay restrictions.
  }

  render();
}

function sampleRandomEffects(count) {
  const pool = [...BENEFICIAL_EFFECT_POOL];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

function sampleRandomStageHazard(excludeId = null) {
  const filtered = excludeId == null
    ? STAGE_HAZARDS_POOL
    : STAGE_HAZARDS_POOL.filter((hazard) => hazard.id !== excludeId);
  const pool = filtered.length > 0 ? filtered : STAGE_HAZARDS_POOL;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

function getRandomBoardSquareKeys(predicate, count) {
  const keys = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if (predicate(row, col)) {
        keys.push(squareKey(row, col));
      }
    }
  }

  for (let i = keys.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }

  return keys.slice(0, count);
}

function setupHazardRuntimeOnActivation(hazardId) {
  resetStageHazardRuntime();

  if (hazardId === 85) {
    const availableTypes = new Set();
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = game.board[row][col];
        if (piece) {
          availableTypes.add(piece.type);
        }
      }
    }
    const pool = availableTypes.size > 0
      ? Array.from(availableTypes)
      : ["pawn", "knight", "bishop", "rook", "queen", "king"];
    stageHazardRuntime.frostbiteType = pool[Math.floor(Math.random() * pool.length)];
  }

  if (hazardId === 86) {
    const mineKeys = getRandomBoardSquareKeys(
      (row, col) => !game.board[row][col],
      3,
    );
    stageHazardRuntime.mines = new Set(mineKeys);
  }

  if (hazardId === 88) {
    const mineKeys = getRandomBoardSquareKeys(() => true, 3);
    stageHazardRuntime.mines = new Set(mineKeys);
  }

  if (hazardId === 99) {
    const blockKeys = getRandomBoardSquareKeys(
      (row, col) => !game.board[row][col],
      1,
    );
    stageHazardRuntime.blockedTiles = new Set(blockKeys);
  }
}

function updateHazardRuntimeAtTurnStart() {
  const activeHazard = getActiveStageHazardId();
  if (!activeHazard) {
    return;
  }

  if (activeHazard === 85) {
    const pool = ["pawn", "knight", "bishop", "rook", "queen", "king"];
    stageHazardRuntime.frostbiteType = pool[Math.floor(Math.random() * pool.length)];
  }

  if (activeHazard === 99) {
    const blockKeys = getRandomBoardSquareKeys(
      (row, col) => !game.board[row][col] && !isBlockedTileSquare(row, col),
      1,
    );
    if (blockKeys.length > 0) {
      stageHazardRuntime.blockedTiles.add(blockKeys[0]);
    }
  }
}

function resetTurnAndStageHazards() {
  completedPlyCount = 0;
  currentFullTurn = 1;
  resetCaptureCooldown();
  resetStageHazardRuntime();
  stageHazardState = {
    active: null,
    remainingTurns: 0,
    activatedOnTurn: null,
  };
}

function advanceStageHazardsAtTurnStart() {
  let hazardEnded = false;
  if (stageHazardState.active) {
    stageHazardState.remainingTurns -= 1;
    if (stageHazardState.remainingTurns <= 0) {
      hazardEnded = true;
      stageHazardState.active = null;
      stageHazardState.remainingTurns = 0;
      stageHazardState.activatedOnTurn = null;
      resetStageHazardRuntime();
    }
  }

  if (currentFullTurn >= 3 && currentFullTurn % 3 === 0) {
    const nextHazard = sampleRandomStageHazard(stageHazardState.active ? stageHazardState.active.id : null);
    stageHazardState.active = nextHazard;
    stageHazardState.remainingTurns = 3;
    stageHazardState.activatedOnTurn = currentFullTurn;
    setupHazardRuntimeOnActivation(nextHazard.id);

    if (nextHazard.id === 69) {
      activeEffects.white = [];
      activeEffects.black = [];
      pendingEffectDraft = null;
      closeEffectPicker();
    }

    detailTextEl.textContent = `Stage Hazard activated: ${nextHazard.name}.`;
  }

  if (hazardEnded) {
    detailTextEl.textContent = "Stage Hazard expired.";
  }

  updateHazardRuntimeAtTurnStart();

  if (!isStageHazardActive(70)) {
    resetCaptureCooldown();
  }
}

function tickEffectsForPlayer(color) {
  activeEffects[color] = activeEffects[color]
    .map((effect) => {
      if (effect.isPersistentUntilUsed) {
        return effect;
      }
      return { ...effect, remainingTurns: effect.remainingTurns - 1 };
    })
    .filter((effect) => effect.remainingTurns > 0);
}

function shouldTriggerEffectDraft() {
  if (isStageHazardActive(69)) {
    return false;
  }
  return Math.random() < (1 / 4);
}

function startEffectDraft(color) {
  pendingEffectDraft = {
    color,
    options: sampleRandomEffects(3),
  };
  openEffectPicker();
}

function applyEffectToColor(chosenEffect, color) {
  if (!chosenEffect) {
    return false;
  }

  if (isStageHazardActive(69)) {
    detailTextEl.textContent = "Nostalgia Bait is active: no new beneficial effects can be gained.";
    return false;
  }

  if (chosenEffect.id === 33) {
    const opponentColor = color === "white" ? "black" : "white";
    if (game.isInCheck(opponentColor)) {
      detailTextEl.textContent = `${capitalize(color)} activated ${chosenEffect.name}, but bonus turn failed because ${opponentColor} is in check.`;
      return false;
    }

    game.turn = color;
    game.bonusMove = { color, requiredType: null };
    detailTextEl.textContent = `${capitalize(color)} activated ${chosenEffect.name}.`;
    triggerPowerUpLightning(color);
    return true;
  }

  const sideEffects = activeEffects[color];
  const existing = sideEffects.find((effect) => effect.id === chosenEffect.id);
  const isPersistentUntilUsed = chosenEffect.id === 46 || chosenEffect.id === 50;
  const normalizedDuration = isPersistentUntilUsed ? Number.MAX_SAFE_INTEGER : chosenEffect.duration;

  if (existing) {
    existing.remainingTurns = isPersistentUntilUsed
      ? Number.MAX_SAFE_INTEGER
      : Math.max(existing.remainingTurns, chosenEffect.duration);
    existing.description = chosenEffect.description;
    existing.isPersistentUntilUsed = isPersistentUntilUsed;
  } else {
    sideEffects.push({
      id: chosenEffect.id,
      name: chosenEffect.name,
      description: chosenEffect.description,
      remainingTurns: normalizedDuration,
      isPersistentUntilUsed,
    });
  }

  detailTextEl.textContent = `${capitalize(color)} gained ${chosenEffect.name}.`;
  triggerPowerUpLightning(color);
  return true;
}

function applyDevEffectFromInput(rawInput) {
  if (!rawInput) {
    return false;
  }

  const parsed = rawInput.trim().match(/^(\d{1,3})(?:\s*([wb]))?$/i);
  if (!parsed) {
    detailTextEl.textContent = "Dev format: 1-50 with optional side (e.g. '44 b') or stage hazard 51-100 (e.g. '85').";
    return false;
  }

  const id = Number(parsed[1]);
  const sideToken = parsed[2] ? parsed[2].toLowerCase() : null;

  if (id >= 51 && id <= 100) {
    const hazard = STAGE_HAZARDS_POOL.find((entry) => entry.id === id);
    if (!hazard) {
      detailTextEl.textContent = `Stage Hazard ${id} does not exist.`;
      return false;
    }

    stageHazardState.active = hazard;
    stageHazardState.remainingTurns = 3;
    stageHazardState.activatedOnTurn = currentFullTurn;
    setupHazardRuntimeOnActivation(hazard.id);

    if (hazard.id === 69) {
      activeEffects.white = [];
      activeEffects.black = [];
      pendingEffectDraft = null;
      closeEffectPicker();
    }

    detailTextEl.textContent = `Dev set Stage Hazard ${hazard.id}: ${hazard.name}.`;
    return true;
  }

  const effectId = id;
  const color = sideToken === "w" ? "white" : sideToken === "b" ? "black" : game.turn;
  const effect = getEffectById(effectId);
  if (!effect) {
    detailTextEl.textContent = `Effect ${effectId} does not exist.`;
    return false;
  }

  return applyEffectToColor(effect, color);
}

function openEffectPicker() {
  if (!pendingEffectDraft) {
    return;
  }

  effectPickerPromptEl.textContent = `${capitalize(pendingEffectDraft.color)} moved. Choose one effect.`;
  effectPickerChoicesEl.innerHTML = "";

  pendingEffectDraft.options.forEach((effect) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "effect-choice";
    button.dataset.effectId = String(effect.id);

    const name = document.createElement("p");
    name.className = "effect-choice-name";
    name.textContent = effect.name;

    const meta = document.createElement("p");
    meta.className = "effect-choice-meta";
    const durationText = effect.duration == null
      ? "until used"
      : `${effect.duration} turn${effect.duration === 1 ? "" : "s"}`;
    meta.textContent = `${effect.description} | ${durationText}`;

    button.append(name, meta);
    effectPickerChoicesEl.appendChild(button);
  });

  effectPickerModalEl.hidden = false;
}

function closeEffectPicker() {
  effectPickerModalEl.hidden = true;
  effectPickerChoicesEl.innerHTML = "";
}

function isPromotionMove(from, to) {
  if (isStageHazardActive(67)) {
    return false;
  }

  const piece = game.getPiece(from);
  if (!piece || piece.type !== "pawn") {
    return false;
  }
  const earlyPromoRow = piece.color === "white" ? 3 : 4;
  const promotionRow = piece.color === "white" ? 0 : 7;
  return to.row === promotionRow || (hasActiveEffect(piece.color, 19) && to.row === earlyPromoRow);
}

function openPromotionPicker(color) {
  promotionChoicesEl.innerHTML = "";

  game.promotionOptions.forEach((pieceType) => {
    const optionBtn = document.createElement("button");
    optionBtn.type = "button";
    optionBtn.className = "promotion-option";
    optionBtn.dataset.pieceType = pieceType;
    optionBtn.setAttribute("aria-label", `Promote to ${pieceType}`);

    const img = document.createElement("img");
    img.src = `Pieces/${color}-${pieceType}.png`;
    img.alt = `${color} ${pieceType}`;
    img.className = "promotion-piece";

    const label = document.createElement("span");
    label.textContent = capitalize(pieceType);

    optionBtn.append(img, label);
    promotionChoicesEl.appendChild(optionBtn);
  });

  promotionModalEl.hidden = false;
  document.body.classList.add("promotion-open");
}

function closePromotionPicker() {
  promotionModalEl.hidden = true;
  document.body.classList.remove("promotion-open");
  promotionChoicesEl.innerHTML = "";
}

function clearTransientGameState() {
  pendingPromotion = null;
  pendingEffectDraft = null;
  activeEffects.white = [];
  activeEffects.black = [];
  game.lostPieces = { white: [], black: [] };
  game.bonusMove = null;
  game.pendingBonusTurns = { white: 0, black: 0 };
  game.safePassageShields = { white: null, black: null };
  resetTurnAndStageHazards();
  lastMovedSquare = null;
  clearPowerUpLightningEffect();
  closePromotionPicker();
  closeEffectPicker();
  clearSelection();
}

function commitMove(from, to, promotionType, movingColor) {
  const result = game.move(from, to, promotionType);
  if (!result.ok) {
    detailTextEl.textContent = result.reason;
    render();
    return;
  }

  lastMovedSquare = {
    row: to.row,
    col: to.col,
    color: movingColor,
  };
  clearPowerUpLightningEffect();

  const fullTurnEnded = game.turn !== movingColor || game.gameOver;
  if (fullTurnEnded) {
    completedPlyCount += 1;
    if (completedPlyCount % 2 === 0) {
      currentFullTurn = (completedPlyCount / 2) + 1;
      if (!game.gameOver) {
        advanceStageHazardsAtTurnStart();
      }
    }

    tickEffectsForPlayer(movingColor);
    if (!game.gameOver && shouldTriggerEffectDraft()) {
      startEffectDraft(movingColor);
    }
  }

  if (game.gameOver) {
    void saveStateToFirebase("auto-game-over");
  }

  render();
}

boardEl.addEventListener("click", (event) => {
  const target = event.target.closest(".square");
  if (!target) {
    return;
  }

  if (devBoardEditMode) {
    const row = Number(target.dataset.row);
    const col = Number(target.dataset.col);
    const nextPiece = nextCyclePiece(game.board[row][col], event.shiftKey);
    game.board[row][col] = nextPiece;

    game.turn = "white";
    game.gameOver = false;
    game.winner = null;
    game.enPassantTarget = null;
    game.bonusMove = null;
    game.pendingBonusTurns = { white: 0, black: 0 };
    game.safePassageShields = { white: null, black: null };
    game.castlingRights = game.createInitialCastlingRights();
    game.lastMessage = "Custom start board saved.";

    pendingPromotion = null;
    pendingEffectDraft = null;
    activeEffects.white = [];
    activeEffects.black = [];
    resetTurnAndStageHazards();
    closePromotionPicker();
    closeEffectPicker();
    clearSelection();
    render();
    return;
  }

  if (game.gameOver || pendingPromotion || pendingEffectDraft) {
    return;
  }

  const row = Number(target.dataset.row);
  const col = Number(target.dataset.col);
  const piece = game.board[row][col];

  if (!selected) {
    if (piece && piece.color === game.turn) {
      selected = { row, col };
      legalTargets = game.getLegalMoves(selected);
      render();
    }
    return;
  }

  const isLegalTarget = legalTargets.some((m) => m.row === row && m.col === col);

  if (isLegalTarget) {
    const destination = { row, col };
    const from = { ...selected };
    const movingColor = game.getPiece(from).color;

    clearSelection();

    if (isPromotionMove(from, destination)) {
      pendingPromotion = {
        from,
        to: destination,
        color: game.getPiece(from).color,
      };
      detailTextEl.textContent = "Choose a piece for pawn promotion.";
      openPromotionPicker(pendingPromotion.color);
      render();
      return;
    }

    commitMove(from, destination, undefined, movingColor);
    return;
  }

  if (piece && piece.color === game.turn) {
    selected = { row, col };
    legalTargets = game.getLegalMoves(selected);
    render();
    return;
  }

  clearSelection();
  render();
});

promotionChoicesEl.addEventListener("click", (event) => {
  const optionBtn = event.target.closest(".promotion-option");
  if (!optionBtn || !pendingPromotion) {
    return;
  }

  const promotionType = optionBtn.dataset.pieceType;
  const promotionMove = pendingPromotion;
  pendingPromotion = null;
  closePromotionPicker();
  commitMove(promotionMove.from, promotionMove.to, promotionType, promotionMove.color);
});

effectPickerChoicesEl.addEventListener("click", (event) => {
  const optionBtn = event.target.closest(".effect-choice");
  if (!optionBtn || !pendingEffectDraft) {
    return;
  }

  const effectId = Number(optionBtn.dataset.effectId);
  const chosen = pendingEffectDraft.options.find((effect) => effect.id === effectId);
  if (!chosen) {
    return;
  }

  const draftingColor = pendingEffectDraft.color;
  applyEffectToColor(chosen, draftingColor);

  pendingEffectDraft = null;
  closeEffectPicker();
  render();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.repeat) {
    event.preventDefault();
    void triggerManualSave("enter-save");
    return;
  }

  if (event.key.length === 1 && /^[a-z]$/i.test(event.key)) {
    waluigiBuffer = (waluigiBuffer + event.key.toLowerCase()).slice(-WALUIGI_CODE.length);
    if (waluigiBuffer === WALUIGI_CODE) {
      devBoardEditMode = !devBoardEditMode;
      waluigiBuffer = "";
      pendingPromotion = null;
      pendingEffectDraft = null;
      closePromotionPicker();
      closeEffectPicker();
      clearSelection();
      detailTextEl.textContent = devBoardEditMode
        ? "Waluigi mode ON. Click to edit board; Shift+click reverses cycle."
        : "Waluigi mode OFF.";
      render();
      return;
    }
  }

  if (event.key !== "\\" || pendingPromotion || pendingEffectDraft) {
    return;
  }

  const raw = window.prompt("Dev: enter effect 1-50 (+ optional w/b, e.g. 44 b) or stage hazard 51-100 (e.g. 85)", "");
  if (raw === null) {
    return;
  }

  if (applyDevEffectFromInput(raw)) {
    render();
  }
});

resetBtnEl.addEventListener("click", () => {
  game.reset();
  clearTransientGameState();
  devBoardEditMode = false;
  waluigiBuffer = "";
  render();
});

if (undoBtnEl) {
  undoBtnEl.addEventListener("click", () => {
    rememberGameName(currentSaveGameName);
    setRestoreSavedGameOnReload(true);
    window.location.reload();
  });
}

emptyBoardBtnEl.addEventListener("click", () => {
  game.board = Array.from({ length: 8 }, () => Array(8).fill(null));
  game.customStartingBoard = null;
  game.turn = "white";
  game.winner = null;
  game.gameOver = false;
  game.enPassantTarget = null;
  game.castlingRights = game.createInitialCastlingRights();
  game.lastMessage = "Board emptied.";
  clearTransientGameState();
  render();
});

playAgainBtnEl.addEventListener("click", () => {
  stopAllGameAudio();
  game.reset();
  clearTransientGameState();
  devBoardEditMode = false;
  waluigiBuffer = "";
  render();
});

if (saveBtnEl) {
  saveBtnEl.addEventListener("click", async () => {
    await triggerManualSave("manual-save");
  });
}

bootstrapFirebaseState();
