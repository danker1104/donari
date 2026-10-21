// @ts-check

export const RenderLayer = Object.freeze({
  BACKGROUND: 10,
  STORYBOARD_BACKGROUND: 20,
  STORYBOARD_FAIL_PASS: 30,
  STORYBOARD_FOREGROUND: 40,
  BACKGROUND_DIM: 50,
  HIT_OBJECT: 60,
  STORYBOARD_OVERLAY: 70,
  HUD: 80,
  CURSOR: 90,
});

export class RenderCoordinator {
  /** @param {{clearRect:(x:number,y:number,width:number,height:number)=>void}} context @param {number} width @param {number} height */
  constructor(context, width, height) {
    this.context = context;
    this.width = width;
    this.height = height;
  }

  /** @param {Array<{layer:number,draw:(context:any)=>void}>} commands */
  render(commands) {
    this.context.clearRect(0, 0, this.width, this.height);
    const ordered = commands.map((command, index) => ({ command, index }))
      .sort((left, right) => left.command.layer - right.command.layer || left.index - right.index);
    for (const { command } of ordered) command.draw(this.context);
  }
}
