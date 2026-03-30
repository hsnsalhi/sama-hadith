export function initBg() {
  const c = document.getElementById('bg-c');
  const ctx = c.getContext('2d');
  c.width = innerWidth;
  c.height = innerHeight;

  const stars = Array.from({ length: 300 }, () => ({
    x: Math.random() * innerWidth,
    y: Math.random() * innerHeight,
    r: Math.random() * .8 + .1,
    a: Math.random() * .4 + .05,
    sp: Math.random() * .01 + .003,
    tw: Math.random() * Math.PI * 2,
  }));

  let t = 0;
  function draw() {
    t += 0.016;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.fillStyle = '#000810';
    ctx.fillRect(0, 0, innerWidth, innerHeight);
    stars.forEach(s => {
      const a = s.a + Math.sin(t * s.sp + s.tw) * .08;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,185,140,${a})`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
}
