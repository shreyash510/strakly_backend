import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DietDocument = Diet & Document;

@Schema({ timestamps: true })
export class DietMeal {
  @Prop({ required: true })
  name: string;

  @Prop()
  time?: string;

  @Prop([String])
  foods: string[];

  @Prop()
  calories?: number;
}

export const DietMealSchema = SchemaFactory.createForClass(DietMeal);

@Schema({ timestamps: true, collection: 'diets' })
export class Diet {
  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  category: string;

  @Prop({ type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' })
  difficulty: string;

  @Prop({ required: true })
  duration: number;

  @Prop({ type: String, enum: ['draft', 'active', 'archived'], default: 'draft' })
  status: string;

  @Prop({ type: [DietMealSchema], default: [] })
  meals: DietMeal[];

  @Prop()
  dailyCalories?: number;

  @Prop({ type: Object })
  macros?: {
    protein: number;
    carbs: number;
    fats: number;
  };

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Gym' })
  gymId?: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const DietSchema = SchemaFactory.createForClass(Diet);
