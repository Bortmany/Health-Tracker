// Where an exercise's picture lives. The file name is the exercise slug
// (see public/img/exercises/README.md). Not used on any screen yet.
export function exerciseImage(slug) {
  return `/img/exercises/${slug}.webp`;
}
