let animateTimeFrame, frame = 0, clock;
const panels = [], previewPanels = [];
// 500ms
const PER_SECOND = 500;

const startButton = document.querySelector("#StartButton");
const pauseButton = document.querySelector("#PauseButton");
const resetButton = document.querySelector("#ResetButton");

const initialize = () => {
  const panel = document.getElementById("TetrominoGameRef");
  const previewPanel = document.getElementById("TetrominoPreviewRef");

  function setPanels(node, list) {
    Array.from(node).forEach(div => {
      const index = +div.getAttribute("row");
      const jIndex = +div.getAttribute("col");

      list[index] = list[index] || [];
      list[index][jIndex] = div;
    });
  }

  setPanels(panel.children, panels);
  setPanels(previewPanel.querySelector(".game-preview").children, previewPanels);
};
const getRealRandomIndex = (() => {
  let pools = [];
  return (min, max) => {
    if (!pools.length) {
      pools = new Array(max - min + 1).fill(0).map((_, index) => min + index);
    }
    let randomIndex = Math.floor((Math.random() * (pools.length - 1)));
    return pools.splice(randomIndex, 1);
  };
})();

class Tetromino {
  static TETRIS_PRESET_MAP = Object.entries({
    "A": () => [
      [0, 1, 0],
      [1, 1, 1],
    ],
    "B": () => [
      [1],
      [1],
      [1],
      [1],
    ],
    "C": () => [
      [1, 1],
      [0, 1],
      [0, 1],
    ],
    "D": () => [
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    "E": () => [
      [0, 1],
      [1, 1],
      [1, 0],
    ],
    "F": () => [
      [1, 1],
      [1, 1],
    ],
    "G": () => [
      [1, 1],
      [1, 0],
      [1, 0],
    ],
    "I": () => [
      [1, 1, 1, 1],
      [1, 0, 1, 0],
    ]
  });

  /** @type {Array<Array<number>>} **/
  #matrix = [];
  row = 0;
  col = 8;
  #tetrisPools = [];

  get rowMaxLength() {
    return this.#matrix.length;
  }

  constructor(outerMatrix, row, col) {
    if (!outerMatrix) return this.#randomInitialize();

    this.#matrix = outerMatrix;
    this.row = row;
    this.col = col;
  }

  #randomInitialize() {
    const randomIndex = getRealRandomIndex(0, Tetromino.TETRIS_PRESET_MAP.length - 1);
    const [, getMatrix] = Tetromino.TETRIS_PRESET_MAP[randomIndex];

    this.#matrix = getMatrix();
  }

  transformAxisPoint(row = this.row, col = this.col) {
    return Tetromino.TransformAxisPoint(this.#matrix, row, col);
  }

  rotate(processor = _ => true) {
    // →(右) Rotate
    let rowMaxIndex = this.#matrix.length - 1;
    let colMaxIndex = this.#matrix[0].length - 1;
    let rotateMatrix = [];

    for (let col = 0; col <= colMaxIndex; col++) {
      rotateMatrix[col] = [];
      for (let row = 0; row <= rowMaxIndex; row++) {
        rotateMatrix[col][rowMaxIndex - row] = this.#matrix[row][col];
      }
    }

    if (processor(rotateMatrix)) {
      this.#matrix = rotateMatrix;
    }

    return rotateMatrix;
  }

  translate(vector, processor = _ => true) {
    let result = processor(this.#matrix);
    if (vector === "down") {
      if (result) {
        this.row++;
      }
    }
    else {
      if (result) {
        this.col += (vector === "left" ? -1 : 1);
      }
    }

    return result;
  }

  static TransformAxisPoint(matrix, row, col) {
    const rowBottom = matrix.length;
    const colCenter = Math.floor(matrix[0].length / 2);
    return matrix.map((rows, rowIndex) => {
      rowIndex = rowIndex - rowBottom;
      return rows.map((item, colIndex) => {
        colIndex = colIndex - colCenter;
        if (!item) return;

        return [item * (rowIndex + row), item * (col + colIndex)];
      }).filter(Boolean);
    }).flat(1);
  }
}

class Game {
  static Events = [];
  static Utils = {
    isUp: code => ["ArrowUp", "KeyW"].includes(code),
    isDown: code => ["ArrowDown", "KeyS"].includes(code),
    isLeft: code => ["ArrowLeft", "KeyA"].includes(code),
    isRight: code => ["ArrowRight", "KeyD"].includes(code),
  };

  #recordAxisPoints = [];
  #previewAxisPoint = [];
  state = "Non-Start";
  /** @type {Tetromino} **/
  #currentTetromino;
  /** @type {Tetromino} **/
  #nextTetromino;
  panelMatrix = [];
  previewPanelMatrix = [];

  assetTest() {

    /*this.#recordAxisPoints[19] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    this.#recordAxisPoints[20] = [0, 1, 2, 3, 4, 5];
    this.#recordAxisPoints[21] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];*/
  }

  start() {
    this.state = "Gaming";
    startButton.classList.add("disabled");
    pauseButton.classList.remove("disabled");
    document.querySelector(".game-over").classList.remove("show");
  }

  gameOver() {
    this.state = "GameOver";
    document.querySelector(".game-over").classList.add("show");
  }

  pause() {
    if (this.state === "Pause") {
      this.state = "Gaming";
      pauseButton.innerText = "Pause";
    }
    else {
      this.state = "Pause";
      pauseButton.innerText = "Continue";
    }
  }

  reset() {
    this.state = "Non-Start";
    this.#recordAxisPoints = [];
    this.#previewAxisPoint = [];
    this.#currentTetromino = null;
    this.renderPanel();
    pauseButton.classList.add("disabled");
    startButton.classList.remove("disabled");
    document.querySelector(".game-over").classList.remove("show");
  }

  get isGaming() {
    return this.state !== "Non-Start";
  }

  get isGameOver() {
    return this.state === "GameOver";
  }

  get isPause() {
    return this.state === "Pause";
  }

  /**
   * @desc 返回值解释： false - 未碰撞 | true - 已碰撞
   * @return {Boolean} **/
  checkTetromino(matrix, row, col) {
    const realAxisPoint = Tetromino.TransformAxisPoint(matrix, row, col);
    for (let [row, col] of realAxisPoint) {
      if (col < 0) return true;
      if (col >= this.panelMatrix[0].length) return true;
      if (row >= this.panelMatrix.length) return true;

      /** @type {HTMLElement} **/
      const panelItem = this.panelMatrix?.[row]?.[col];

      if (panelItem) {
        if (panelItem.getAttribute("value") === "2") {
          return true;
        }
      }
    }
    return false;
  }

  renderPanel() {
    // 重置已设置的元素
    this.panelMatrix.forEach(rows => rows.forEach(panelItem => {
      panelItem.setAttribute("value", "0");
    }));
    this.previewPanelMatrix.forEach(rows => rows.forEach(panelItem => {
      panelItem.setAttribute("value", "0");
    }));

    // debugger;
    this.#previewAxisPoint.forEach(([row, col]) => {
      let previewItem = this.previewPanelMatrix?.[row]?.[col];
      if (previewItem) {
        previewItem?.setAttribute("value", "1");
      }
    });

    // 绘画已有方块
    let entries = Object.entries(this.#recordAxisPoints), _rewriteRow = [], offset = 0;
    for (let [row, cols] of entries.reverse()) {
      row = +row;
      if (cols.length >= this.panelMatrix[0].length) {
        delete this.#recordAxisPoints[row];
        offset++;
        continue;
      }

      _rewriteRow.push([row + offset, cols]);
    }

    this.#recordAxisPoints = [];
    for (let [row, cols] of _rewriteRow) {
      this.#recordAxisPoints[row] = cols;

      for (let col of cols) {
        /** @type {HTMLElement} **/
        let panelItem = this.panelMatrix?.[row]?.[col];
        if (panelItem) {
          panelItem.setAttribute("value", "2");
        }
      }
    }

    if (this.#currentTetromino) {
      const realAxis = this.#currentTetromino.transformAxisPoint();

      for (let [row, col] of realAxis) {
        let panelItem = this.panelMatrix?.[row]?.[col];
        if (panelItem) {
          panelItem.setAttribute("value", "1");
        }
      }
    }
  }

  translateTetromino() {

  }

  // 每一秒Loop
  run() {
    if (this.isGaming) {
      if (this.isPause) return;
      if (this.isGameOver) return;

      if (!this.#currentTetromino) {
        this.#currentTetromino = this.#nextTetromino;
        this.#nextTetromino = new Tetromino();
        this.#previewAxisPoint = this.#nextTetromino.transformAxisPoint(this.#nextTetromino.rowMaxLength, 2);

      }

      if (this.#currentTetromino) {
        const isSuccess = this.#currentTetromino.translate("down", matrix => {
          return !this.checkTetromino(matrix, this.#currentTetromino.row + 1, this.#currentTetromino.col);
        });
        if (!isSuccess) {
          this.#currentTetromino.transformAxisPoint().forEach(item => {
            const [row, col] = item;

            if (this.#recordAxisPoints[row]) {
              if (this.#recordAxisPoints[row].includes(col)) {
                return;
              }
            }

            if (!this.#recordAxisPoints[row]) this.#recordAxisPoints[row] = [];
            this.#recordAxisPoints[row].push(col);
          });

          if (this.#currentTetromino.row <= 0) {
            this.gameOver();
          }
          this.#currentTetromino = null;
        }
        this.renderPanel();
      }
    }
  }

  #eventListener(e) {
    if (!this.isGaming || !this.#currentTetromino) return;

    if (Game.Utils.isUp(e.code)) {
      this.#currentTetromino.rotate(rotateMatrix => {
        return !this.checkTetromino(rotateMatrix, this.#currentTetromino.row, this.#currentTetromino.col);
      });
      this.renderPanel();
    }
    else if (Game.Utils.isDown(e.code)) {
      this.#currentTetromino.translate("down", matrix => {
        return !this.checkTetromino(matrix, this.#currentTetromino.row + 1, this.#currentTetromino.col);
      });
      this.renderPanel();
    }
    else if (Game.Utils.isLeft(e.code)) {
      this.#currentTetromino.translate("left", matrix => {
        return !this.checkTetromino(matrix, this.#currentTetromino.row, this.#currentTetromino.col - 1);
      });
      this.renderPanel();
    }
    else if (Game.Utils.isRight(e.code)) {
      this.#currentTetromino.translate("right", matrix => {
        return !this.checkTetromino(matrix, this.#currentTetromino.row, this.#currentTetromino.col + 1);
      });
      this.renderPanel();
    }
  }

  constructor(outerPanels, outerPreviewPanels) {
    this.assetTest();
    this.panelMatrix = outerPanels;
    this.previewPanelMatrix = outerPreviewPanels;

    Game.on("keydown", this.#eventListener.bind(this));
  }

  dispose() {
    Game.Events.forEach(unwatch => unwatch());
  }

  static on(eventName, listener) {
    let _listener = event => listener(event);
    Game.Events.push(() => Game.off(eventName, _listener));
    document.addEventListener(eventName, _listener);
  }

  static off(eventName, listener) {
    document.removeEventListener(eventName, listener);
  }
}

const game = new Game(panels, previewPanels);

function render(timestamp) {
  animateTimeFrame = requestAnimationFrame(render);

  if (!clock) clock = timestamp;
  if ((timestamp - clock) >= PER_SECOND) {
    game.run();

    frame = 0;
    clock = 0;
  }

  frame++;
}

function runMain() {
  initialize();
  animateTimeFrame = requestAnimationFrame(render);

  document.body.onload = null;
  document.addEventListener("keydown", (e) => {
    const code = e.code;

    if (["ArrowLeft", "KeyA"].includes(code)) {

    }
    else if (["ArrowRight", "KeyD"].includes(code)) {

    }
    else if (["ArrowUp", "KeyW"].includes(code)) {

    }
    else if (["ArrowDown", "KeyS"].includes(code)) {

    }
  });
  startButton.addEventListener("click", () => game.start());
  pauseButton.addEventListener("click", () => game.pause());
  resetButton.addEventListener("click", () => game.reset());
}

document.body.onload = runMain;
