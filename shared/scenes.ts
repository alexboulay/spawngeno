import type { PromptObject, SceneObject } from "./protocol";

export interface SceneDef {
  id: string;
  title: string;
  /** Objects drawn in the scene (correct YES answers). */
  present: SceneObject[];
  /** Plausible objects NOT in the scene (correct NO answers). */
  decoys: PromptObject[];
}

export const SCENES: SceneDef[] = [
  {
    id: "living-room",
    title: "Living Room",
    present: [
      { id: "sofa", label: "Sofa", emoji: "🛋️", x: 28, y: 62 },
      { id: "tv", label: "TV", emoji: "📺", x: 70, y: 40 },
      { id: "lamp", label: "Lamp", emoji: "💡", x: 16, y: 30 },
      { id: "plant", label: "Plant", emoji: "🪴", x: 85, y: 66 },
      { id: "clock", label: "Clock", emoji: "🕐", x: 50, y: 18 },
      { id: "cat", label: "Cat", emoji: "🐱", x: 42, y: 78 },
      { id: "book", label: "Book", emoji: "📖", x: 60, y: 70 },
    ],
    decoys: [
      { id: "fish", label: "Fish", emoji: "🐟" },
      { id: "umbrella", label: "Umbrella", emoji: "🌂" },
      { id: "guitar", label: "Guitar", emoji: "🎸" },
      { id: "cactus", label: "Cactus", emoji: "🌵" },
      { id: "phone", label: "Phone", emoji: "📱" },
    ],
  },
  {
    id: "park",
    title: "Park",
    present: [
      { id: "tree", label: "Tree", emoji: "🌳", x: 20, y: 40 },
      { id: "bench", label: "Bench", emoji: "🪑", x: 48, y: 70 },
      { id: "dog", label: "Dog", emoji: "🐕", x: 64, y: 78 },
      { id: "kite", label: "Kite", emoji: "🪁", x: 78, y: 22 },
      { id: "ball", label: "Ball", emoji: "⚽", x: 36, y: 82 },
      { id: "bird", label: "Bird", emoji: "🐦", x: 30, y: 24 },
      { id: "flower", label: "Flower", emoji: "🌻", x: 86, y: 74 },
    ],
    decoys: [
      { id: "car", label: "Car", emoji: "🚗" },
      { id: "tv2", label: "TV", emoji: "📺" },
      { id: "pizza", label: "Pizza", emoji: "🍕" },
      { id: "umbrella2", label: "Umbrella", emoji: "🌂" },
      { id: "snowman", label: "Snowman", emoji: "⛄" },
    ],
  },
  {
    id: "kitchen",
    title: "Kitchen",
    present: [
      { id: "fridge", label: "Fridge", emoji: "🧊", x: 18, y: 52 },
      { id: "apple", label: "Apple", emoji: "🍎", x: 44, y: 66 },
      { id: "knife", label: "Knife", emoji: "🔪", x: 58, y: 60 },
      { id: "kettle", label: "Kettle", emoji: "🫖", x: 72, y: 56 },
      { id: "bread", label: "Bread", emoji: "🍞", x: 36, y: 70 },
      { id: "mug", label: "Mug", emoji: "☕", x: 82, y: 68 },
      { id: "carrot", label: "Carrot", emoji: "🥕", x: 50, y: 78 },
    ],
    decoys: [
      { id: "soccer", label: "Soccer Ball", emoji: "⚽" },
      { id: "rocket", label: "Rocket", emoji: "🚀" },
      { id: "guitar2", label: "Guitar", emoji: "🎸" },
      { id: "dog2", label: "Dog", emoji: "🐕" },
      { id: "flower2", label: "Flower", emoji: "🌻" },
    ],
  },
];
