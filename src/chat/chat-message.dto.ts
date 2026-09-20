import { IsNotEmpty, IsString } from "class-validator";

export class ChatMessageDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsString()
  message: string;
}
